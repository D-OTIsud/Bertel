-- migration_amenity_room_scope.sql
-- §75: scope the ~30 room-relevant amenities to 'both' so the §06 room equipment picker
-- (which filters scope IN ('room','both')) shows ONLY room-relevant amenities — hiding the
-- establishment-level ones (Bar, Restaurant, Parking, the 43 accessibility items, sports…).
--
-- 'both' (NOT 'room') is deliberate: it keeps these amenities in the §10/§05 OBJECT picker too
-- (scope IN ('object','both')) ⇒ no existing `object_amenity` selection is orphaned (towels/
-- shower/kitchenette have high object-level usage — 233/229/272). The other 106 amenities stay
-- 'object' ⇒ they simply vanish from the room picker, unchanged everywhere else.
--
-- DATA fixup, IDEMPOTENT (re-run = same), REVERSIBLE (`SET scope = 'object'`). Code-list-derived
-- ⇒ deterministic, so a fresh DB reproduces it exactly (unlike the usage-derived §73 order).
-- After step 11 (seeds_data.sql — seeds ref_amenity with scope='object').

UPDATE public.ref_amenity SET scope = 'both'
WHERE code IN (
  -- climate / general / security comforts that apply to an object AND a room
  'wifi','tv','air_conditioning','heating','fan','safe','balcony','private_terrace',
  -- bedroom
  'bed_linen','sofa','desk','iron','extra_pillows','blackout_curtains',
  -- bathroom
  'towels','shower','private_bathroom','jacuzzi','shared_bathroom','hairdryer','bathrobes','toiletries','bathtub',
  -- kitchenette
  'kitchenette','coffee_machine','microwave','refrigerator',
  -- general / entertainment (room)
  'telephone','minibar','dvd_player'
);
