# Stage 0 — Asset report

## Sources in the repo
| Zip | Content | Characters | Rig / bones | Animations |
|---|---|---|---|---|
| `glTF-20261023T123741Z-1-001.zip` | Quaternius humans (Ultimate Animated Character Pack style) | 52 | shared rig, 23 bones | 17: Idle, Walk, Run, Jump, **SitDown**, **StandUp**, Victory, PickUp, Punch, … |
| `glTF-20261023T123847Z-1-001.zip` | Quaternius monsters (texture atlas) | 16 | 43 bones | 14: Idle, Walk, Run, Jump, Wave, Yes, No, Duck, … |
| `glTF-20261023T123901Z-1-001.zip` | Quaternius small monsters/animals | 17 | 4 bones | 9: Idle, Walk, Jump, Dance, Yes, No, … |
| `glTF-20261023T123909Z-1-001.zip` | Quaternius flying monsters | 17 (Demon excluded: 1 animation only) | 13–46 bones | 8: Flying_Idle, Fast_Flying, Yes, No, … (no Walk) |
| `KayKit_Adventurers_2.0_FREE.zip` | KayKit Adventurers | 6 | Rig_Medium, 23 bones | none in model; shared files: Idle, Walking, Running, Jump, Interact, … (no sit) |
| `Universal Animation Library[Standard].zip` | Quaternius animation library (no characters) | – | 65 bones | 43 incl. Sitting_Enter/Idle/Exit, Idle_Talking, Walk_Formal |

Several monster names appear in more than one zip (Alien, Birb, Cactoro, Fish, Ninja, Orc, Yeti, Pigeon, Tribal, Demon) as different versions; selection never picks the same name twice.

## Selection (4 per zip, evenly spaced over the name-sorted list)
See `assets/characters.json`. Preview: `docs/reference/characters-sheet.png`.

- humans: Casual2_Female, Doctor_Male_Old, Ninja_Sand, VikingHelmet
- monsters-a: BlueDemon, Dino, MushroomKing, Tribal
- monsters-b: Cat (owner request, replaces neighbouring Cactoro), Fish, Mushnub_Evolved, PinkBlob
- monsters-c: Armabee, Ghost, Goleling, Squidle
- kaykit: Barbarian, Mage, Ranger, Rogue_Hooded

Output: `public/models/characters/*.glb` (meshopt + quantized, textures WebP ≤512px) and `public/models/animations/Rig_Medium_*.glb` for KayKit. Total ≈ 5 MB (from ≈ 21 MB). Loading needs the Meshopt decoder (supported by drei `useGLTF`).

Scripts: `scripts/inspect-assets.cjs`, `scripts/select-characters.cjs`, `scripts/convert-characters.cjs`.

## What is missing
- **Controllable face:** no model has morph targets/blendshapes or a jaw bone. Eyes are geometry; no mouth. Mouth-by-voice and emotes need the fallback (face plane/decal on the head bone, or emote bubble).
- **Sitting:** only the humans have SitDown/StandUp. Monsters and KayKit have none; flying monsters have no Walk either.
- **Rigs differ** across the 5 groups (23 / 43 / 4 / 13–46 / KayKit 23), so animations cannot be shared across groups. UAL sitting animations are on a 65-bone rig and would need retargeting.
- **First-person arms:** humans and monsters are a single skinned mesh (head cannot be hidden by mesh; needs bone scaling). KayKit has separate arm/head meshes.
- Skin colour of some humans is very dark in the source materials; this is the original look, not a conversion bug.

## Licenses
- KayKit Adventurers 2.0: **CC0** (`License.txt` in the zip).
- Universal Animation Library: **CC0** (`License.txt` in the zip).
- The four Quaternius glTF zips contain **no license file**. Quaternius publishes these packs as CC0, but this could not be verified from here (the site is blocked by the environment network).
