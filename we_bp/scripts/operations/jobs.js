import { system } from "@minecraft/server";
import { beginEditProtection, endEditProtection } from "./protect.js";

const activeJobs = new Map();

/**
 * Generator wrapper that holds edit protection (tile drops off) for the
 * job's lifetime and unregisters its id once it finishes.
 * @param {Generator} generator The job generator.
 * @param {Set<number>} jobs The player's active job id set.
 * @param {{id: number}} holder Holds the job id assigned after scheduling.
 * @returns {Generator} The wrapped generator.
 */
function* trackedJob(generator, jobs, holder) {
    beginEditProtection();
    yield* generator;
    endEditProtection();
    jobs.delete(holder.id);
}

/**
 * Schedules a job generator and tracks its id so we:cancel can stop it.
 * @param {string} playerName The acting player's name.
 * @param {Generator} generator The job generator.
 * @returns {void}
 */
function runTrackedJob(playerName, generator) {
    let jobs = activeJobs.get(playerName);
    if (!jobs) {
        jobs = new Set();
        activeJobs.set(playerName, jobs);
    }
    const holder = { id: 0 };
    holder.id = system.runJob(trackedJob(generator, jobs, holder));
    jobs.add(holder.id);
}

/**
 * Stops every tracked job a player has running, without undoing the partial
 * work already done.
 * @param {string} playerName The player's name.
 * @returns {number} The number of jobs cancelled.
 */
function cancelJobs(playerName) {
    const jobs = activeJobs.get(playerName);
    if (!jobs || jobs.size === 0) {
        return 0;
    }
    let count = 0;
    for (const id of jobs) {
        system.clearJob(id);
        endEditProtection();
        count += 1;
    }
    jobs.clear();
    return count;
}

export { runTrackedJob, cancelJobs };
