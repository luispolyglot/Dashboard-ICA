/* ══════════════════════════════════════════════════════════════════════
   COACHING ICA · EJERCICIO DE MUESTRA (plantilla oficial de Luis)
   Ejemplo real (Gretta, modales, inglés A2). Se usa:
   - como modelo en el prompt del generador (la IA copia su estructura),
   - en los tests del corrector.
   Si cambias la plantilla, cambia este objeto.
   ══════════════════════════════════════════════════════════════════════ */

export const COACHING_EXERCISE_TEMPLATE_EXAMPLE = {
  idioma: "Inglés",
  nivel: "A2",
  foco: "Can · Could · Should · Would",
  foco_subtitulo:
    "Elegir el modal que toca y dejar el verbo de detrás desnudo, sin to, sin -ing y sin -s. El verbo lo eliges tú.",
  foco_slot: "Foco 2",
  fase: "Abierto",

  umbral: 13,

  equivalencias: {
    "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six",
    "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve",
  },

  /* Reglas del corrector para inglés (ver CORRECTOR más abajo) */
  libre: {
    prohibidas: ["to", "not", "t"],
    no_verbo: [
      "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
      "someone", "somebody", "anyone", "anybody", "everyone", "the", "a", "an",
      "my", "your", "his", "our", "their", "this", "that", "please", "d", "m", "s", "ve", "re", "ll",
      "am", "is", "are",
    ],
    no_termina: ["ing"],
    excepciones: [
      "bring", "sing", "ring", "thing", "string", "king", "wing", "swing", "sting", "spring",
      "morning", "evening", "nothing", "something", "anything", "everything", "during", "ceiling",
      "need", "feed", "seed", "shed", "speed", "bleed", "breed", "exceed", "succeed", "proceed", "indeed",
    ],
  },

  etiquetas: {
    eleccion: "Elegir el modal que toca",
    infinitivo: "Verbo desnudo detrás del modal",
    invariable: "El modal no cambia nunca",
  },

  bloques: [
    {
      id: "reconocer",
      titulo: "Reconocer",
      instruccion: "Cuatro frases. Solo una versión de cada una aguanta.",
      tipo: "opcion",
      items: [
        {
          lead: "Le cuentas a tu compañera qué te apetecería hacer en el próximo viaje.",
          tags: ["eleccion"],
          options: [
            { t: "I will like to go to Japan.", ok: false, why: "Will te lleva al futuro seguro: me gustará. Para el matiz de me gustaría el modal es would." },
            { t: "I would like to go to Japan.", ok: true, why: "Would like es la fórmula fija de me gustaría, y detrás de like sí va to + verbo." },
            { t: "I would like go to Japan.", ok: false, why: "Aquí el to no sobra: lo pide like. El que no lleva to es el verbo que va justo detrás del modal." },
          ],
        },
        {
          lead: "Tu compañera te pregunta si puedes ir a la reunión de las tres.",
          tags: ["infinitivo"],
          options: [
            { t: "I can to go to the meeting at three.", ok: false, why: "Detrás de can el verbo va desnudo. El to se queda fuera." },
            { t: "I can go to the meeting at three.", ok: true, why: "Can + verbo en su forma base, sin nada en medio." },
            { t: "I can going to the meeting at three.", ok: false, why: "El -ing marca una acción en marcha; detrás de un modal el verbo no lo lleva." },
          ],
        },
        {
          lead: "Marta llega tarde a todas las reuniones y le das tu consejo.",
          tags: ["invariable"],
          options: [
            { t: "She shoulds arrive earlier.", ok: false, why: "Los modales no se mueven con he o she: nunca llevan -s." },
            { t: "She should arrive earlier.", ok: true, why: "Should se queda igual con she, y el verbo de detrás tampoco cambia." },
            { t: "She should to arrive earlier.", ok: false, why: "Should ya sostiene la frase: el verbo que le sigue va sin to." },
          ],
        },
        {
          lead: "Propones algo que quizá sea posible: acabar la cumbre antes de las seis.",
          tags: ["eleccion"],
          options: [
            { t: "We can finish before six.", ok: false, why: "Can dice que es posible seguro. Para el podríamos, con su punto de duda, el modal es could." },
            { t: "We could finish before six.", ok: true, why: "Could es el podría del español, y el verbo de detrás se queda en su forma base." },
            { t: "We could to finish before six.", ok: false, why: "Detrás de cualquier modal el verbo va desnudo, también detrás de could." },
          ],
        },
      ],
    },

    {
      id: "construir",
      titulo: "Construir",
      instruccion:
        "Escribe la frase como te salga: el verbo, el orden y los detalles los eliges tú. Solo se corrige el modal y la forma del verbo que va detrás.",
      tipo: "escritura",
      items: [
        {
          situacion: "Le dices a tu compañera qué te gustaría hacer el año que viene.",
          ejemplo: "I would like to travel to Japan next year.",
          verbos: [
            {
              nombre: "would like to + verbo",
              formas: ["would|d like|love to _"],
              mal: ["will|ll like|love", "would|d like|love _", "would|d liked"],
              tags: ["eleccion"],
              nota: "Me gustaría es would like to + el verbo que quieras. Will like sería me gustará.",
            },
          ],
        },
        {
          situacion: "Organizáis la reunión del viernes. Dile a tu compañera algo que tú puedes hacer y algo que Marta no puede hacer.",
          ejemplo: "I can prepare the presentation, but Marta cannot come to the meeting.",
          verbos: [
            {
              nombre: "can + verbo · lo que tú puedes",
              formas: ["can ~ _"],
              mal: ["can ~ to _", "can ~ _ing"],
              tags: ["infinitivo"],
              nota: "Detrás de can el verbo va en su forma base: ni to ni -ing.",
            },
            {
              nombre: "can't + verbo · lo que Marta no puede",
              formas: ["cannot ~ _", "can t ~ _", "can not ~ _"],
              mal: ["doesn|don t can", "cannot ~ to _", "can t ~ to _", "cannot ~ _ing", "can t ~ _ing", "cans"],
              tags: ["invariable", "infinitivo"],
              nota: "Con Marta el modal no cambia, y el not se pega a can: no hace falta doesn't.",
            },
          ],
        },
        {
          situacion: "Marta llega tarde a todas las reuniones. Dale un consejo sobre lo que debería hacer.",
          ejemplo: "She should leave home earlier.",
          verbos: [
            {
              nombre: "should + verbo · el consejo para Marta",
              formas: ["should ~ _"],
              mal: ["shoulds ~ _", "should ~ to _", "should ~ _ing", "must ~ to _"],
              tags: ["invariable", "infinitivo"],
              nota: "Should no coge la -s de she, y el verbo que le sigue tampoco.",
            },
          ],
        },
        {
          situacion: "Un compañero te pregunta si mañana puedes ir a la reunión. No estás segura: di que podrías ir, y qué harías allí si vas.",
          ejemplo: "I could go to the meeting. I would present my project.",
          verbos: [
            {
              nombre: "could + verbo · lo que sería posible",
              formas: ["could ~ _"],
              mal: ["can ~ _", "could ~ to _", "could ~ _ing"],
              tags: ["eleccion", "infinitivo"],
              nota: "Podría es could. Can sería puedo, sin ese punto de duda.",
            },
            {
              nombre: "would + verbo · lo que harías",
              formas: ["would|d ~ _"],
              mal: ["will|ll ~ _", "would|d ~ to _", "would|d ~ _ing"],
              tags: ["eleccion"],
              nota: "Harías es would + el verbo que quieras. Will sería harás, sin condición.",
            },
          ],
        },
      ],
    },

    {
      id: "conversacion",
      titulo: "En conversación",
      instruccion:
        "Una conversación con una compañera de la organización. Te doy el infinitivo y la pista en español; el modal y la forma los pones tú. Se corrige entera de una vez.",
      tipo: "dialogo",
      lineas: [
        { quien: "Sarah", texto: "Hi Gretta! The summit report is still open." },
        { quien: "Tú", texto: "Don't worry, I {0} it tonight." },
        { quien: "Sarah", texto: "Great. And Marta? She is very busy this week." },
        { quien: "Tú", texto: "Marta {1} to the meeting, but she {2} me the numbers before Friday." },
        { quien: "Sarah", texto: "Perfect. I {3} a coffee after the meeting, or we {4} earlier, around eleven." },
      ],
      items: [
        { verbo: "finish · puedo", formas: ["can|could finish"], show: "can finish", tags: ["infinitivo"], why: "Detrás de can el verbo va desnudo: ni to ni -ing." },
        { verbo: "come · no puede", formas: ["cannot come", "can t come", "can not come"], show: "cannot come", tags: ["invariable", "infinitivo"], why: "El sujeto es Marta y aun así can se queda igual: sin -s y sin doesn't." },
        { verbo: "send · debería", formas: ["should send"], show: "should send", tags: ["invariable", "eleccion"], why: "Lo que le conviene hacer es should, y con she sigue siendo should send." },
        { verbo: "like · me gustaría", formas: ["would|d like"], show: "would like", tags: ["eleccion"], why: "Me gustaría es would like; will like sería me gustará." },
        { verbo: "meet · podríamos", formas: ["could meet"], show: "could meet", tags: ["eleccion", "infinitivo"], why: "Podríamos es could, y el verbo de detrás en su forma base." },
      ],
    },
  ],
};
