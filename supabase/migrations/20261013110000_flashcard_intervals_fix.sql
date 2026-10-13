-- FLASHCARDS: ARREGLAR LOS INTERVALOS QUE SE DISPARARON (Luis, 13 Oct 2026)
--
-- Before «flashcards por fechas», every right answer multiplied the word's interval, even when the
-- word came out many times on the same day. In production 1,603 words had more than 365 days, 87
-- of them more than 100 million, and on 13 Oct at 06:56 twelve answers could not be saved
-- («out of range for type integer»).
--
-- The new code never goes above 365 days. This puts the words that already went too far back where
-- the new rules would have left them. A word's interval becomes the smallest of:
--   - 365 days;
--   - what its right answers in a row give with the new rules: 1, 3, 8, 20, 50, 125, 313, 365;
--   - 2.5 times the days the word had been in the Baúl ICA when it was last reviewed (at least 1),
--     because a word added yesterday cannot have earned a wait of months.
-- Intervals are only lowered, never raised. Streak, ease and dates are not touched.
-- (13 Oct: 4,345 of 41,125 words change; the middle one goes from 112 days to 31.)

begin;

update public.lexicards l
   set interval = c.cap
  from (
    select id,
           least(
             365,
             case
               when coalesce(streak, 0) <= 1 then 1
               when streak = 2 then 3
               when streak = 3 then 8
               when streak = 4 then 20
               when streak = 5 then 50
               when streak = 6 then 125
               when streak = 7 then 313
               else 365
             end,
             greatest(
               1,
               ceil(
                 extract(epoch from (coalesce(last_reviewed_at, now()) - created_at)) / 86400.0 * 2.5
               )::int
             )
           ) as cap
      from public.lexicards
  ) c
 where c.id = l.id
   and l.interval > c.cap;

commit;
