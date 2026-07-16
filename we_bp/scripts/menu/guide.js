import { world, Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

/**
 * @typedef {{cmd: string, desc: string}} GuideEntry
 * @typedef {{title: string, intro: string, entries: GuideEntry[]}} GuideSection
 */

/** @type {GuideSection[]} */
const SECTIONS = [
    {
        title: "Selection",
        intro: "Right-click the wooden axe wand: left-click a block for pos1, right-click for pos2. Or set positions by command.",
        entries: [
            { cmd: "/we:wand", desc: "Get the selection wand (wooden axe)." },
            { cmd: "/we:pos1  /we:pos2", desc: "Set a corner at your feet." },
            { cmd: "/we:pos <n>", desc: "Set polygon vertex n (fills confine to it)." },
            { cmd: "/we:sel", desc: "Show the current selection size." },
            { cmd: "/we:expand /we:contract /we:shift", desc: "Grow, shrink, or move the selection." },
            { cmd: "/we:outset /we:inset", desc: "Grow or shrink on every axis." },
            { cmd: "/we:draw", desc: "Trace a polygon selection by looking; click the wand to start/finish." }
        ]
    },
    {
        title: "Region Edits",
        intro: "Operate on the box between pos1 and pos2 (or inside a polygon selection). e-variants take patterns like 50stone,50cobblestone.",
        entries: [
            { cmd: "/we:set  /we:eset", desc: "Fill the selection with a block or pattern." },
            { cmd: "/we:replace  /we:ereplace", desc: "Swap one block for another." },
            { cmd: "/we:walls /we:cube /we:hcube", desc: "Build walls or cube shells." },
            { cmd: "/we:hollow", desc: "Carve out the interior." },
            { cmd: "/we:overlay  /we:eoverlay", desc: "Blanket the surface with a block." },
            { cmd: "/we:move  /we:stack", desc: "Move or repeat the selection." },
            { cmd: "/we:count", desc: "Count a block type in the selection." },
            { cmd: "/we:center", desc: "Place a block at the selection center." }
        ]
    },
    {
        title: "Generation",
        intro: "Build shapes at your feet from a block or pattern.",
        entries: [
            { cmd: "/we:sphere /we:hsphere", desc: "Solid or hollow sphere." },
            { cmd: "/we:cyl /we:hcyl", desc: "Solid or hollow cylinder." },
            { cmd: "/we:pyramid /we:hpyramid", desc: "Pyramid; negative size = inverted." },
            { cmd: "/we:generate", desc: "Fill by a math expression (x,y,z span -1..1)." },
            { cmd: "/we:bridge  /we:ebridge", desc: "Path/curve between the two positions." }
        ]
    },
    {
        title: "Clipboard",
        intro: "Copy keeps the selection's offset from where you stand; paste places it at the same offset from your new position.",
        entries: [
            { cmd: "/we:copy  /we:cut", desc: "Copy (or copy then clear) the selection." },
            { cmd: "/we:paste [skipAir]", desc: "Paste at the same offset you copied from." },
            { cmd: "/we:rotate  /we:flip", desc: "Rotate or mirror the next paste." },
            { cmd: "/we:clearclipboard", desc: "Delete the saved copy." }
        ]
    },
    {
        title: "World Brush",
        intro: "The World Brush item paints while you hold right-click. Save a preset with /we:brush, then equip it. Types: sculpt (fill), paint (surface), erase, gradient, noise.",
        entries: [
            { cmd: "/we:brush <name> <type> [shape] [block] [radius] [height]", desc: "Save and equip a brush preset." },
            { cmd: "/we:setbrush", desc: "Menu to equip a saved brush preset." },
            { cmd: "/we:clearbrush", desc: "Unequip the World Brush." },
            { cmd: "/we:gradient start|stop|delete|list", desc: "Build an ordered gradient from your inventory blocks." }
        ]
    },
    {
        title: "Terrain Builder",
        intro: "The Terrain Builder item sculpts terrain while you hold right-click. Set its mode with /we:terrain. Repeated clicks stack seamlessly.",
        entries: [
            { cmd: "/we:terrain <mode> [radius] [strength]", desc: "raise, lower, flatten, smooth, extrude, roughen, distort." },
            { cmd: "/we:floodfill <block> [limit] [up] [down] [corners]", desc: "Flood a connected area from your crosshair." },
            { cmd: "/we:smooth", desc: "Smooth the selection, preserving mass." }
        ]
    },
    {
        title: "Utility & Navigation",
        intro: "Quick tools that act around you or move you.",
        entries: [
            { cmd: "/we:removenear /we:replacenear", desc: "Edit a block type within a radius (max 64)." },
            { cmd: "/we:drain", desc: "Remove nearby liquids." },
            { cmd: "/we:up /we:thru /we:ascend /we:descend", desc: "Move up, through walls, or between platforms." },
            { cmd: "/we:jumpto /we:ceil /we:unstuck", desc: "Teleport to your crosshair, the ceiling, or out of blocks." }
        ]
    },
    {
        title: "History & Misc",
        intro: "Undo is per-edit and grouped for mass operations.",
        entries: [
            { cmd: "/we:undo  /we:redo", desc: "Reverse or re-apply your last edit." },
            { cmd: "/we:history  /we:clearhistory", desc: "View or clear your edit history." },
            { cmd: "/we:symmetry", desc: "Mirror or radial-repeat your building." },
            { cmd: "/we:cancel", desc: "Stop a running edit." },
            { cmd: "/we:book", desc: "Get this guide book." }
        ]
    }
];

/**
 * Opens the World Editor guide: a categorized action form of every command.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the guide closes.
 */
async function openGuide(player) {
    const fresh = world.getAllPlayers().find((p) => p.name === player.name);
    if (fresh) {
        fresh.playSound("random.pop");
    }
    const form = new ActionFormData()
        .title("§dWorld Editor Guide")
        .body("§7A world-building toolkit. Pick a category to see its commands.\n§7Two items drive the brushes: the §bWorld Brush§7 and the §aTerrain Builder§7 - hold right-click to use them.");
    for (const section of SECTIONS) {
        form.button("§l" + section.title);
    }
    form.button("§cClose");
    const res = await form.show(player);
    if (res.canceled || res.selection === undefined || res.selection >= SECTIONS.length) {
        return;
    }
    await openGuideSection(player, res.selection);
}

/**
 * Opens one guide section listing its commands, with a back button.
 * @param {Player} player The player to show to.
 * @param {number} index The section index.
 * @returns {Promise<void>} Resolves when the section closes.
 */
async function openGuideSection(player, index) {
    const section = SECTIONS[index];
    const lines = [section.intro, ""];
    for (const entry of section.entries) {
        lines.push("§b" + entry.cmd);
        lines.push("§7- " + entry.desc);
    }
    const form = new ActionFormData()
        .title("§d" + section.title)
        .body(lines.join("\n"))
        .button("§8Back")
        .button("§cClose");
    const res = await form.show(player);
    if (!res.canceled && res.selection === 0) {
        await openGuide(player);
    }
}

export { openGuide };
