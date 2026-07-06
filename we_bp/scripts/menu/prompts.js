import { Player } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

const DIRECTION_OPTIONS = ["Facing", "Up", "Down", "North", "South", "East", "West"];

/**
 * Maps a direction dropdown index to a direction name, or undefined for facing.
 * @param {number} index The dropdown index.
 * @returns {string|undefined} The direction name.
 */
function directionFromIndex(index) {
    if (index === 0) {
        return undefined;
    }
    return DIRECTION_OPTIONS[index].toLowerCase();
}

/**
 * Prompts for a block id and optionally an include-air toggle.
 * @param {Player} player The player to prompt.
 * @param {string} title The form title.
 * @param {boolean} withAir Whether to show the include-air toggle.
 * @returns {Promise<{blockId: string, includeAir: boolean}|null>} The inputs, or null.
 */
async function promptBlock(player, title, withAir) {
    const form = new ModalFormData().title(title).textField("Block or pattern", "stone or 50stone,50cobblestone");
    if (withAir) {
        form.toggle("Include air", { defaultValue: true });
    }
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
        return null;
    }
    return { blockId: String(response.formValues[0]), includeAir: Boolean(response.formValues[1]) };
}

/**
 * Prompts for two block ids (from and to).
 * @param {Player} player The player to prompt.
 * @param {string} title The form title.
 * @returns {Promise<{fromId: string, toId: string}|null>} The inputs, or null.
 */
async function promptTwoBlocks(player, title) {
    const form = new ModalFormData()
        .title(title)
        .textField("Replace block id", "stone")
        .textField("With block or pattern", "dirt or 50dirt,50gravel");
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
        return null;
    }
    return { fromId: String(response.formValues[0]), toId: String(response.formValues[1]) };
}

/**
 * Prompts for an amount and optionally a direction.
 * @param {Player} player The player to prompt.
 * @param {string} title The form title.
 * @param {string} label The amount slider label.
 * @param {number} max The slider maximum.
 * @param {boolean} withDirection Whether to show the direction dropdown.
 * @returns {Promise<{amount: number, direction: string|undefined}|null>} The inputs, or null.
 */
async function promptAmount(player, title, label, max, withDirection) {
    const form = new ModalFormData().title(title).slider(label, 1, max, { valueStep: 1, defaultValue: 1 });
    if (withDirection) {
        form.dropdown("Direction", DIRECTION_OPTIONS, { defaultValueIndex: 0 });
    }
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
        return null;
    }
    const amount = Number(response.formValues[0]);
    const direction = withDirection ? directionFromIndex(Number(response.formValues[1])) : undefined;
    return { amount, direction };
}

/**
 * Prompts for a shape: size slider(s), block id, and hollow/include-air toggles.
 * @param {Player} player The player to prompt.
 * @param {string} title The form title.
 * @param {string} sizeLabel The primary size slider label.
 * @param {number} sizeMax The primary size maximum.
 * @param {boolean} withHeight Whether to show a height slider.
 * @returns {Promise<{size: number, height: number, blockId: string, hollow: boolean, includeAir: boolean}|null>} The inputs, or null.
 */
async function promptShape(player, title, sizeLabel, sizeMax, withHeight) {
    const form = new ModalFormData().title(title).slider(sizeLabel, 1, sizeMax, { valueStep: 1, defaultValue: 5 });
    if (withHeight) {
        form.slider("Height", 1, 128, { valueStep: 1, defaultValue: 10 });
    }
    form.textField("Block or pattern", "stone or 50stone,50cobblestone");
    form.toggle("Hollow", { defaultValue: false });
    form.toggle("Include air", { defaultValue: true });
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
        return null;
    }
    const values = response.formValues;
    let index = 0;
    const size = Number(values[index]);
    index += 1;
    const height = withHeight ? Number(values[index]) : 1;
    if (withHeight) {
        index += 1;
    }
    const blockId = String(values[index]);
    const hollow = Boolean(values[index + 1]);
    const includeAir = Boolean(values[index + 2]);
    return { size, height, blockId, hollow, includeAir };
}

/**
 * Prompts for a brush: radius, optional height, block or pattern, tool item,
 * and hollow/include-air toggles.
 * @param {Player} player The player to prompt.
 * @param {string} title The form title.
 * @param {boolean} withHeight Whether to show a height slider.
 * @returns {Promise<{radius: number, height: number, blockText: string, itemText: string, hollow: boolean, includeAir: boolean}|null>} The inputs, or null.
 */
async function promptBrush(player, title, withHeight) {
    const form = new ModalFormData().title(title).slider("Radius", 1, 5, { valueStep: 1, defaultValue: 3 });
    if (withHeight) {
        form.slider("Height", 1, 32, { valueStep: 1, defaultValue: 4 });
    }
    form.textField("Block or pattern", "stone or 50stone,50cobblestone");
    form.textField("Tool item id (blank = held tool)", "iron_shovel");
    form.toggle("Hollow", { defaultValue: false });
    form.toggle("Include air", { defaultValue: true });
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
        return null;
    }
    const values = response.formValues;
    let index = 0;
    const radius = Number(values[index]);
    index += 1;
    const height = withHeight ? Number(values[index]) : 1;
    if (withHeight) {
        index += 1;
    }
    const blockText = String(values[index]);
    const itemText = String(values[index + 1]);
    const hollow = Boolean(values[index + 2]);
    const includeAir = Boolean(values[index + 3]);
    return { radius, height, blockText, itemText, hollow, includeAir };
}

const GENERATE_PRESETS = [
    { name: "Custom", expression: "" },
    { name: "Sphere", expression: "x^2+y^2+z^2<1" },
    { name: "Torus", expression: "(0.75-sqrt(x^2+z^2))^2+y^2<0.25^2" },
    { name: "Cone", expression: "sqrt(x^2+z^2)<(1-y)/2" },
    { name: "Waves", expression: "y<sin(x*pi)*sin(z*pi)*0.5" }
];

/**
 * Prompts for a generate expression (preset or custom) and a block.
 * @param {Player} player The player to prompt.
 * @returns {Promise<{expression: string, blockText: string}|null>} The inputs, or null.
 */
async function promptGenerate(player) {
    const form = new ModalFormData()
        .title("Generate")
        .dropdown("Preset", GENERATE_PRESETS.map((preset) => preset.name), { defaultValueIndex: 0 })
        .textField("Custom expression (x, y, z span -1 to 1)", "x^2+y^2+z^2<1")
        .textField("Block or pattern", "stone");
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
        return null;
    }
    const preset = GENERATE_PRESETS[Number(response.formValues[0])];
    const expression = preset.expression === "" ? String(response.formValues[1]) : preset.expression;
    return { expression, blockText: String(response.formValues[2]) };
}

/**
 * Prompts for a radius and optionally a block id.
 * @param {Player} player The player to prompt.
 * @param {string} title The form title.
 * @param {boolean} withBlock Whether to show a block id field.
 * @returns {Promise<{radius: number, blockId: string}|null>} The inputs, or null.
 */
async function promptRadius(player, title, withBlock) {
    const form = new ModalFormData().title(title).slider("Radius", 1, 64, { valueStep: 1, defaultValue: 8 });
    if (withBlock) {
        form.textField("Block id", "stone");
    }
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
        return null;
    }
    return { radius: Number(response.formValues[0]), blockId: withBlock ? String(response.formValues[1]) : "" };
}

/**
 * Prompts for a clipboard rotation.
 * @param {Player} player The player to prompt.
 * @returns {Promise<number|null>} The degrees, or null.
 */
async function promptRotation(player) {
    const form = new ModalFormData().title("Rotate Clipboard").dropdown("Degrees", ["90", "180", "270"], { defaultValueIndex: 0 });
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
        return null;
    }
    return [90, 180, 270][Number(response.formValues[0])];
}

/**
 * Prompts for a clipboard flip axis.
 * @param {Player} player The player to prompt.
 * @returns {Promise<string|null>} The axis ("x" or "z"), or null.
 */
async function promptFlipAxis(player) {
    const form = new ModalFormData().title("Flip Clipboard").dropdown("Axis", ["X (east-west)", "Z (north-south)"], { defaultValueIndex: 0 });
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
        return null;
    }
    return Number(response.formValues[0]) === 0 ? "x" : "z";
}

export { promptBlock, promptTwoBlocks, promptAmount, promptShape, promptBrush, promptGenerate, promptRadius, promptRotation, promptFlipAxis };
