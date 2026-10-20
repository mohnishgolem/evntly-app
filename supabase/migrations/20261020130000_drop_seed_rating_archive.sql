-- The archived seed ratings (made-up rating/review_count values the demo
-- vendors carried before ratings were recalculated from real reviews in
-- ratings_from_real_reviews) have no further use. Drop them and the
-- otherwise-empty archive schema.

drop table if exists archive.seed_vendor_ratings;
drop schema if exists archive;
