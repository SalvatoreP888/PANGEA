# PANGEA foundation provenance

- IsoCity by amilich: https://github.com/amilich/isometric-city — MIT, LICENSE retained. Baseline b774dd7913103e9dd9ec51b2151893c22683886e. New runtime directly imports projection, tile drawing and image loading utilities from this clone.
- Existing PANGAEA Realms 0.5 code: copied from the user's attached PANGEA workspace, baseline bd967b4. No changes to the copied simulation rules. Test imports were adjusted to the new module path; two original save fixtures support migration tests.
- FlatQueue 3.0.0: license retained at src/pangea/simulation/vendor/flatqueue.LICENSE.
- Manrope: Copyright 2018 The Manrope Project Authors, SIL Open Font License 1.1, included at public/pangea/Manrope-OFL.txt.
- New generated artwork: public/pangea/atlas.png (eight separate isometric architecture/vegetation/mountain archetypes) and public/pangea/ground.png (seamless meadow material); compressed WebP equivalents preserve dimensions and transparency.
