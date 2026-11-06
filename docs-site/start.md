<script setup>
import StartDoors from "./.vitepress/theme/components/StartDoors.vue";
import FilmFacade from "./.vitepress/theme/components/FilmFacade.vue";
</script>

# Get a floor plan from your AI

Pick the way in that suits you. They run from the least set-up to the most. The playground is for
looking around: open a plan, change a number, see what moves. Every other way in has your AI write
the ArchLang, and the compiler draws a dimensioned plan and tells your AI what is wrong with it.

<StartDoors />

## Watch the film

<FilmFacade poster="/examples/laneway-house.svg" />

## What next

- [Floor plans written by AI agents](/gallery): one-paragraph briefs and the plans agents wrote from them.
- [Starting from a photo or a PDF](/from-an-image): your AI reads the image; ArchLang does not.
- [Change one room without moving the others](/edit-one-room): `impact --lock` checks an edit.
- [The guide](/guide): what the language looks like, one statement at a time.

## Who maintains it

ArchLang is maintained by Chan Meng, a single maintainer. It is written with AI coding agents, and
changes are checked in CI. How decisions are made:
[GOVERNANCE.md](https://github.com/ChanMeng666/archlang/blob/main/GOVERNANCE.md).
