import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IcaTestAnswer, IcaTestQuestion } from '../types'

type RunnerAnswerContext = {
  answer: IcaTestAnswer
  answers: IcaTestAnswer[]
  nextQuestionIndex: number
  score: number
}

type UseIcaTestRunnerParams = {
  questions: IcaTestQuestion[]
  secondsPerQuestion: number
  onAnswer?: (context: RunnerAnswerContext) => Promise<void> | void
  onAnswerError?: (error: unknown) => void
  onFinish: (answers: IcaTestAnswer[]) => Promise<void> | void
}

type UseIcaTestRunnerResult = {
  currentQuestion: IcaTestQuestion | null
  currentQuestionIndex: number
  totalQuestions: number
  timeLeft: number
  progressPercent: number
  answers: IcaTestAnswer[]
  score: number
  isFinished: boolean
  isAnswering: boolean
  answerQuestion: (selectedOptionIndex: number | null, timedOut?: boolean) => void
}

export function useIcaTestRunner({
  questions,
  secondsPerQuestion,
  onAnswer,
  onAnswerError,
  onFinish,
}: UseIcaTestRunnerParams): UseIcaTestRunnerResult {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(secondsPerQuestion)
  const [answers, setAnswers] = useState<IcaTestAnswer[]>([])
  const [isFinished, setIsFinished] = useState(false)
  const [isAnswering, setIsAnswering] = useState(false)
  const currentQuestionLockedRef = useRef(false)
  const answersRef = useRef<IcaTestAnswer[]>([])

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  useEffect(() => {
    setCurrentQuestionIndex(0)
    setTimeLeft(secondsPerQuestion)
    setAnswers([])
    setIsFinished(false)
    setIsAnswering(false)
    currentQuestionLockedRef.current = false
  }, [questions, secondsPerQuestion])

  const answerQuestion = useCallback(
    (selectedOptionIndex: number | null, timedOut = false) => {
      if (isFinished || isAnswering || questions.length === 0) return
      if (currentQuestionLockedRef.current) return

      const question = questions[currentQuestionIndex]
      if (!question) return

      currentQuestionLockedRef.current = true
      setIsAnswering(true)

      void (async () => {
        try {
          const isCorrect =
            selectedOptionIndex !== null &&
            selectedOptionIndex === question.correctOptionIndex

          const nextAnswer: IcaTestAnswer = {
            questionIndex: currentQuestionIndex,
            selectedOptionIndex,
            isCorrect,
            timedOut,
          }

          const nextAnswers = [...answersRef.current, nextAnswer]
          const nextQuestionIndex = nextAnswers.length
          const score = nextAnswers.reduce(
            (acc, answer) => acc + Number(answer.isCorrect),
            0,
          )

          if (onAnswer) {
            await onAnswer({
              answer: nextAnswer,
              answers: nextAnswers,
              nextQuestionIndex,
              score,
            })
          }

          answersRef.current = nextAnswers
          setAnswers(nextAnswers)

          const isLastQuestion = nextAnswers.length >= questions.length
          if (isLastQuestion) {
            setIsFinished(true)
            await onFinish(nextAnswers)
            return
          }

          setCurrentQuestionIndex(nextQuestionIndex)
          setTimeLeft(secondsPerQuestion)
        } catch (error) {
          if (onAnswerError) {
            onAnswerError(error)
          }
        } finally {
          currentQuestionLockedRef.current = false
          setIsAnswering(false)
        }
      })()
    },
    [
      currentQuestionIndex,
      isAnswering,
      isFinished,
      onAnswer,
      onAnswerError,
      onFinish,
      questions,
      secondsPerQuestion,
    ],
  )

  useEffect(() => {
    if (isFinished || isAnswering || questions.length === 0) return

    const timeoutId = window.setTimeout(() => {
      if (timeLeft <= 1) {
        answerQuestion(null, true)
        return
      }
      setTimeLeft((value) => value - 1)
    }, 1000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [answerQuestion, isAnswering, isFinished, questions.length, timeLeft])

  const currentQuestion = questions[currentQuestionIndex] ?? null
  const totalQuestions = questions.length
  const score = useMemo(
    () => answers.reduce((acc, answer) => acc + Number(answer.isCorrect), 0),
    [answers],
  )
  const progressPercent = totalQuestions
    ? (answers.length / totalQuestions) * 100
    : 0

  return {
    currentQuestion,
    currentQuestionIndex,
    totalQuestions,
    timeLeft,
    progressPercent,
    answers,
    score,
    isFinished,
    isAnswering,
    answerQuestion,
  }
}
