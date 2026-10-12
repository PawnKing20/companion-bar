# Companion Bar

A themed roster window for Foundry VTT that shows what the party's companions are up to, with a wax-seal **!** for when one of them wishes to speak.

## Features

- A roster of companions with portraits, names and their current activity.
- The GM sets activities from a picker, or steps through them with arrows or right-click.
- A **!** seal marks a companion who wishes to speak. Players hear a chime, get a notification, and the roster opens on their screens.
- Players see everything live and read-only.
- Five themes (Rustic, Sunset, Grove, Midnight, Ember) and adjustable window opacity, chosen per user.
- A compact mode that shows just a row of portraits.
- Custom activities with any Font Awesome icon or emoji.

## Install

In Foundry's **Add-on Modules → Install Module**, search for **Companion Bar**, or paste this manifest URL:

```
https://github.com/PawnKing20/companion-bar/releases/latest/download/module.json
```

Then enable **Companion Bar** in your world under *Manage Modules*.

## Use

- **Open it:** the campfire-tent button in the Token controls (left toolbar). You can also bind a key under *Configure Controls*.
- **Add companions (GM):** drag an Actor from the sidebar onto the roster, or click the add-person button and type a name. Click a name to rename it.
- **Set activity (GM):** click the activity or the small medallion on the portrait to pick from the list. On hover, ‹ › step through activities; right-click steps back.
- **Wishes to speak (GM):** hover a row and click the **!**. Click the seal to clear it, or use the bell button to clear all.
- **Portraits (GM):** hover → image icon to choose one. Drag a portrait onto another row to reorder. Clicking a portrait linked to an Actor opens its sheet.
- **Compact roster:** the grid button switches to a row of portraits.
- **Theme & opacity:** the palette button, or *Configure Settings → Companion Bar → Theme & Opacity*.

## Settings

- **Custom activities:** comma-separated, icon first. The icon can be any [Font Awesome](https://fontawesome.com/search?o=r&m=free&s=solid) name or an emoji:
  `fa-fish Fishing, fa-music Playing Music, fa-skull Plotting`.
  Set the icon's color with pipes: `fa-fish | Fishing | #5f6b3a`. Reusing a built-in name (e.g. `fa-fire Cooking`) replaces it.
- **Use only my custom activities:** hides the built-in list.
- **Open the roster for players on "!"**, **Chime on "!"** (per user), **Open roster on load** (per user).

Built-in activities: Resting, Sleeping, Working, Cooking, Reading, Brooding, Keeping Watch, Training, Tinkering, Painting, Gardening, Praying, Drinking, Chatting, Exploring, Away.

## Macros

```js
const cb = game.modules.get("companion-bar").api;
cb.toggle();
cb.setActivity("Bramble", "keeping-watch");
cb.setAlert("Bramble", true);
```

## License

MIT
