import { world, system, BlockVolume, Dimension, Player } from "@minecraft/server";
import { setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { CHUNK, chunkFloor } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan } from "./ticking.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Counts blocks of a type inside a box using native filtered volume queries in
 * ticking-area batches, then messages the player with the result.
 * @param {Player} player The player counting.
 * @param {Dimension} dimension The dimension to read.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {string} matchId The block id to count.
 * @returns {void}
 */
function runCount(player, dimension, min, max, matchId) {
    setBusy(player.name, true);
    system.runJob(countJob(dimension, min, max, matchId, player.name));
}

/**
 * Generator backing runCount: per ticked batch, tallies matching blocks with
 * one filtered getBlocks call per chunk-column slab instead of reading blocks
 * one by one.
 * @param {Dimension} dimension The dimension to read.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {string} matchId The block id to count.
 * @param {string} playerName The counting player's name.
 * @returns {Generator} The count job generator.
 */
function* countJob(dimension, min, max, matchId, playerName) {
    let count = 0;
    const blockFilter = { includeTypes: [matchId] };
    const span = pickAreaSpan();
    for (let ax = chunkFloor(min.x); ax <= max.x; ax += span) {
        for (let az = chunkFloor(min.z); az <= max.z; az += span) {
            const areaMin = { x: Math.max(ax, min.x), y: min.y, z: Math.max(az, min.z) };
            const areaMax = { x: Math.min(ax + span - 1, max.x), y: max.y, z: Math.min(az + span - 1, max.z) };
            const ok = yield* tickAreaFor(dimension, areaMin, areaMax, playerName);
            if (!ok) {
                continue;
            }
            for (let x = areaMin.x; x <= areaMax.x; x = chunkFloor(x) + CHUNK) {
                for (let z = areaMin.z; z <= areaMax.z; z = chunkFloor(z) + CHUNK) {
                    for (let y = areaMin.y; y <= areaMax.y; y += WE_CONFIG.fillSlab) {
                        const subMin = { x, y, z };
                        const subMax = {
                            x: Math.min(chunkFloor(x) + CHUNK - 1, areaMax.x),
                            y: Math.min(y + WE_CONFIG.fillSlab - 1, areaMax.y),
                            z: Math.min(chunkFloor(z) + CHUNK - 1, areaMax.z)
                        };
                        const matched = dimension.getBlocks(new BlockVolume(subMin, subMax), blockFilter, false);
                        count += matched.getCapacity();
                        yield;
                    }
                }
            }
        }
    }
    releaseTickArea(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§aCount: §f" + count + "§a block(s) of §f" + matchId + "§a.");
    }
    setBusy(playerName, false);
}

/**
 * Reports the block-type distribution of a box: tallies every block type and
 * messages the player the counts, most common first (WorldEdit //distr).
 * @param {Player} player The player querying.
 * @param {Dimension} dimension The dimension to read.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {void}
 */
function runDistribution(player, dimension, min, max) {
    setBusy(player.name, true);
    system.runJob(distributionJob(dimension, min, max, player.name));
}

/**
 * Generator backing runDistribution: reads each cell's type into a tally in
 * ticked batches, then messages the sorted result.
 * @param {Dimension} dimension The dimension to read.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {string} playerName The querying player's name.
 * @returns {Generator} The distribution job generator.
 */
function* distributionJob(dimension, min, max, playerName) {
    const tally = new Map();
    let total = 0;
    let processed = 0;
    const span = pickAreaSpan();
    for (let ax = chunkFloor(min.x); ax <= max.x; ax += span) {
        for (let az = chunkFloor(min.z); az <= max.z; az += span) {
            const areaMin = { x: Math.max(ax, min.x), y: min.y, z: Math.max(az, min.z) };
            const areaMax = { x: Math.min(ax + span - 1, max.x), y: max.y, z: Math.min(az + span - 1, max.z) };
            const ok = yield* tickAreaFor(dimension, areaMin, areaMax, playerName);
            if (!ok) {
                yield;
                continue;
            }
            for (let x = areaMin.x; x <= areaMax.x; x++) {
                for (let z = areaMin.z; z <= areaMax.z; z++) {
                    for (let y = areaMin.y; y <= areaMax.y; y++) {
                        const block = dimension.getBlock({ x, y, z });
                        if (block) {
                            const id = block.typeId;
                            tally.set(id, (tally.get(id) ?? 0) + 1);
                            total += 1;
                        }
                        processed += 1;
                        if (processed % WE_CONFIG.blocksPerYield === 0) {
                            yield;
                        }
                    }
                }
            }
        }
    }
    releaseTickArea(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        const sorted = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
        const lines = sorted.map(([id, n]) => "§f  " + n + " §7(" + (total > 0 ? Math.round(n / total * 1000) / 10 : 0) + "%) §b" + id.replace("minecraft:", ""));
        player.sendMessage("§6Distribution (§f" + total + "§6 blocks):\n" + lines.join("\n"));
    }
    setBusy(playerName, false);
}

export { runCount, runDistribution };
