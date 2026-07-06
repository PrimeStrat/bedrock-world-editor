import { system, Player } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";

const CHEST_TITLE_27 = "§w§e§u§i§2§7§r";
const NEUTRAL_CODE = "";
const CHEST_SLOTS = 27;

/**
 * @typedef {{slot: number, icon: string, hover: string, run: function(Player):void}} ChestEntry
 */

/**
 * Shows a form, retrying next tick while the player's UI is busy.
 * @param {Player} player The player to show to.
 * @param {ActionFormData} form The form to show.
 * @returns {Promise<import("@minecraft/server-ui").ActionFormResponse>} The response.
 */
async function showFormUntilSeen(player, form) {
    let response = await form.show(player);
    while (response.canceled && response.cancelationReason === FormCancelationReason.UserBusy) {
        await new Promise((resolve) => system.run(resolve));
        response = await form.show(player);
    }
    return response;
}

/**
 * Shows a 27-slot chest menu (routed by the shared chest UI title sentinel).
 * Empty slots render invisible; each entry's hover text shows as its tooltip.
 * @param {Player} player The player to show to.
 * @param {string} title The chest label text.
 * @param {ChestEntry[]} entries The populated slots.
 * @returns {Promise<void>} Resolves after the selected entry runs.
 */
async function showChestMenu(player, title, entries) {
    const form = new ActionFormData().title(CHEST_TITLE_27 + title);
    const bySlot = new Map();
    for (const entry of entries) {
        bySlot.set(entry.slot, entry);
    }
    const ordered = [];
    for (let i = 0; i < CHEST_SLOTS; i++) {
        const entry = bySlot.get(i);
        if (entry) {
            form.button(NEUTRAL_CODE + entry.hover, entry.icon);
            ordered.push(entry);
        } else {
            form.button("", "");
            ordered.push(null);
        }
    }
    const response = await showFormUntilSeen(player, form);
    if (response.canceled || response.selection === undefined) {
        return;
    }
    const entry = ordered[response.selection];
    if (entry) {
        entry.run(player);
    }
}

export { showChestMenu, showFormUntilSeen };
