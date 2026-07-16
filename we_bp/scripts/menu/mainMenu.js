import { system, Player } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getHistory } from "../session.js";
import { showChestMenu } from "./chest.js";
import { undoEdit, redoEdit, massUndo, massRedo, clearEditHistory } from "../actions/history.js";
import { saveBrushPreset, deleteBrushPreset, setBrush, clearBrush, brushEntries, setTerrain } from "../actions/tools.js";
import { gradientEntries } from "../actions/gradient.js";

/**
 * Sends an action result message to a player when one is present.
 * @param {Player} player The player to message.
 * @param {{ok: boolean, message: string}} result The action result.
 * @returns {void}
 */
function report(player, result) {
    if (result.message) {
        player.sendMessage(result.message);
    }
}

const BRUSH_TYPES = ["sculpt", "paint", "erase", "gradient", "noise"];

/**
 * Opens the brushes chest menu: create World Brush presets, set the Terrain
 * Builder, equip a saved brush, and view saved brushes and gradients.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openBrushMenu(player) {
    await showChestMenu(player, "§8Brushes", [
        {
            slot: 10, icon: "textures/items/we_brush", hover: "§e§lNew Brush...§r\n§7Save+equip a World Brush preset", run: async (p) => {
                const input = await promptNewBrush(p);
                if (input) {
                    report(p, saveBrushPreset(p, input.name, input.brushType, input.shape, input.blockText, input.radius, input.height, input.hollow, true));
                }
            }
        },
        { slot: 12, icon: "textures/items/nether_star", hover: "§e§lSet Brush§r\n§7Equip a saved brush preset", menu: true, run: (p) => openSetBrushMenu(p) },
        { slot: 13, icon: "textures/items/bucket_empty", hover: "§e§lClear Brush§r\n§7Unequip the World Brush", run: (p) => report(p, clearBrush(p)) },
        {
            slot: 15, icon: "textures/items/we_terrain", hover: "§e§lTerrain Builder...§r\n§7Set raise/lower/flatten/smooth", run: async (p) => {
                const input = await promptTerrain(p);
                if (input) {
                    report(p, setTerrain(p, input.mode, input.radius, input.strength));
                }
            }
        },
        { slot: 16, icon: "textures/items/book_normal", hover: "§e§lSaved Items§r\n§7View saved brushes and gradients", menu: true, run: (p) => openSavedItemsForm(p) }
    ]);
}

/**
 * Prompts for a new brush preset: name, type, shape, block/gradient, radius,
 * height, and hollow.
 * @param {Player} player The player to prompt.
 * @returns {Promise<{name: string, brushType: string, shape: string, blockText: string, radius: number, height: number, hollow: boolean}|null>} The inputs, or null.
 */
async function promptNewBrush(player) {
    const form = new ModalFormData().title("New Brush")
        .textField("Name", "hills")
        .dropdown("Type", ["Sculpt - fill the shape (add mass)", "Paint - reskin the surface facing you", "Erase - carve a hole", "Gradient - surface, steps a #gradient", "Noise - fill, blocks in organic patches"], { defaultValueIndex: 0 })
        .dropdown("Shape", ["Sphere", "Cylinder", "Hollow sphere", "Hollow cylinder"], { defaultValueIndex: 0 })
        .textField("Block/pattern (or #gradient for gradient type)", "stone")
        .slider("Radius", 1, 5, { valueStep: 1, defaultValue: 3 })
        .slider("Cylinder height", 1, 16, { valueStep: 1, defaultValue: 4 });
    const res = await form.show(player);
    if (res.canceled || !res.formValues) {
        return null;
    }
    const v = res.formValues;
    const shapes = ["sphere", "cylinder", "hsphere", "hcylinder"];
    const shapeChoice = shapes[Number(v[2])];
    const shape = shapeChoice === "cylinder" || shapeChoice === "hcylinder" ? "cylinder" : "sphere";
    const hollow = shapeChoice === "hsphere" || shapeChoice === "hcylinder";
    return { name: String(v[0]), brushType: BRUSH_TYPES[Number(v[1])], shape, blockText: String(v[3]), radius: Number(v[4]), height: Number(v[5]), hollow };
}

/**
 * Prompts for a terrain builder mode, radius, and strength.
 * @param {Player} player The player to prompt.
 * @returns {Promise<{mode: string, radius: number, strength: number}|null>} The inputs, or null.
 */
async function promptTerrain(player) {
    const form = new ModalFormData().title("Terrain Builder")
        .dropdown("Mode", ["Raise", "Lower", "Flatten", "Smooth", "Extrude", "Roughen", "Distort"], { defaultValueIndex: 0 })
        .slider("Radius", 1, 5, { valueStep: 1, defaultValue: 4 })
        .slider("Strength", 1, 8, { valueStep: 1, defaultValue: 2 });
    const res = await form.show(player);
    if (res.canceled || !res.formValues) {
        return null;
    }
    const modes = ["raise", "lower", "flatten", "smooth", "extrude", "roughen", "distort"];
    return { mode: modes[Number(res.formValues[0])], radius: Number(res.formValues[1]), strength: Number(res.formValues[2]) };
}

/**
 * Opens the set-brush chest menu: lists saved brush presets to equip on the
 * World Brush, marking the currently equipped one.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openSetBrushMenu(player) {
    const presets = brushEntries(player);
    const entries = [];
    let slot = 0;
    for (const preset of presets) {
        const marker = preset.equipped ? "§a[equipped] " : "";
        entries.push({
            slot, icon: preset.equipped ? "textures/items/dye_powder_green" : "textures/items/diamond_pickaxe",
            hover: "§e§l" + preset.name + "§r\n§7" + preset.detail + "\n" + marker + "§eClick to equip", menu: true, run: (p) => {
                report(p, setBrush(p, preset.name));
                return openSetBrushMenu(p);
            }
        });
        slot += 1;
    }
    if (presets.length === 0) {
        entries.push({ slot: 4, icon: "textures/items/book_normal", hover: "§7No brushes saved.\n§7Make one with New Brush.", menu: true, run: (p) => openBrushMenu(p) });
    } else {
        entries.push({
            slot: 25, icon: "textures/items/flint_and_steel", hover: "§e§lDelete Brush...§r\n§7Remove a saved preset", menu: true, run: async (p) => {
                const names = brushEntries(p).map((e) => e.name);
                const form = new ModalFormData().title("Delete Brush").dropdown("Brush", names, { defaultValueIndex: 0 });
                const res = await form.show(p);
                if (!res.canceled && res.formValues) {
                    report(p, deleteBrushPreset(p, names[Number(res.formValues[0])]));
                }
                return openSetBrushMenu(p);
            }
        });
    }
    entries.push({ slot: 26, icon: "textures/items/dye_powder_red", hover: "§c§lBack", menu: true, run: (p) => openBrushMenu(p) });
    await showChestMenu(player, "§8Set Brush", entries);
}

/**
 * Opens a read-only form listing the player's saved brushes and gradients.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the form closes.
 */
async function openSavedItemsForm(player) {
    const presets = brushEntries(player);
    const gradients = gradientEntries(player);
    const lines = [];
    lines.push("§6Saved Brushes");
    if (presets.length === 0) {
        lines.push("§7  none");
    } else {
        for (const preset of presets) {
            lines.push("§f  " + preset.name + " §7- " + preset.detail + (preset.equipped ? " §a(equipped)" : ""));
        }
    }
    lines.push("");
    lines.push("§6Gradients");
    if (gradients.length === 0) {
        lines.push("§7  none");
    } else {
        for (const grad of gradients) {
            lines.push("§f  #" + grad.name + " §7- §b" + grad.label);
        }
    }
    const form = new ActionFormData().title("§8Saved Items").body(lines.join("\n")).button("§cClose");
    await form.show(player);
    await openBrushMenu(player);
}

const HISTORY_PAGE_SIZE = 18;

/**
 * Returns the chest icon for a history record's edit kind.
 * @param {object} record The edit record.
 * @returns {string} The icon texture path.
 */
function historyIcon(record) {
    if (record.kind === "group") {
        return "textures/items/book_writable";
    }
    if (record.kind === "box") {
        return "textures/items/clay_ball";
    }
    if (record.kind === "shape") {
        return "textures/items/snowball";
    }
    return "textures/items/paper";
}

/**
 * Opens the history chest menu: a paged list of the player's edits (newest
 * first, redoable edits marked) with undo, redo, and clear controls.
 * @param {Player} player The player to show to.
 * @param {number} page The zero-based page to show.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openHistoryMenu(player, page) {
    const now = system.currentTick;
    const history = getHistory(player.name);
    const records = [];
    for (const record of history.undo) {
        records.push({ record, redoable: false });
    }
    for (const record of history.redo) {
        records.push({ record, redoable: true });
    }
    const pages = Math.max(1, Math.ceil(records.length / HISTORY_PAGE_SIZE));
    const current = Math.min(Math.max(page, 0), pages - 1);
    const start = current * HISTORY_PAGE_SIZE;
    const slice = records.slice(start, start + HISTORY_PAGE_SIZE);
    const entries = [];
    const undoCount = history.undo.length;
    for (let i = 0; i < slice.length; i++) {
        const item = slice[i];
        const absolute = start + i;
        const seconds = Math.max(0, Math.round((now - item.record.tick) / 20));
        const state = item.redoable ? "§8(redoable)" : "§7#" + (absolute + 1);
        const action = item.redoable ? "§aClick to redo up to here" : "§aClick to undo up to here";
        entries.push({
            slot: i,
            icon: historyIcon(item.record),
            hover: "§e§l" + item.record.label + "§r\n§7" + item.record.blocks + " block(s), " + seconds + "s ago " + state + "\n" + action,
            menu: true,
            run: (pl) => {
                report(pl, item.redoable ? massRedo(pl, absolute - undoCount + 1) : massUndo(pl, absolute + 1));
                return openHistoryMenu(pl, 0);
            }
        });
    }
    if (records.length === 0) {
        entries.push({ slot: 4, icon: "textures/items/book_normal", hover: "§7No edits yet", menu: true, run: (pl) => openHistoryMenu(pl, 0) });
    }
    if (current > 0) {
        entries.push({ slot: 18, icon: "textures/items/dye_powder_green", hover: "§a§lPrevious Page", menu: true, run: (pl) => openHistoryMenu(pl, current - 1) });
    }
    entries.push({
        slot: 21, icon: "textures/items/book_normal", hover: "§e§lUndo§r\n§7Reverse your last edit", menu: true, run: (pl) => {
            report(pl, undoEdit(pl));
            return openHistoryMenu(pl, current);
        }
    });
    entries.push({
        slot: 22, icon: "textures/items/book_enchanted", hover: "§e§lRedo§r\n§7Re-apply your last undo", menu: true, run: (pl) => {
            report(pl, redoEdit(pl));
            return openHistoryMenu(pl, current);
        }
    });
    entries.push({
        slot: 23, icon: "textures/items/flint_and_steel", hover: "§e§lClear History§r\n§7Discard undo and redo", menu: true, run: (pl) => {
            report(pl, clearEditHistory(pl));
            return openHistoryMenu(pl, 0);
        }
    });
    if (start + HISTORY_PAGE_SIZE < records.length) {
        entries.push({ slot: 26, icon: "textures/items/dye_powder_green", hover: "§a§lNext Page", menu: true, run: (pl) => openHistoryMenu(pl, current + 1) });
    }
    await showChestMenu(player, "§8History " + (current + 1) + "/" + pages, entries);
}

export { openHistoryMenu, openSetBrushMenu, openBrushMenu };
