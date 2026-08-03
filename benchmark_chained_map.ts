import { expect, test } from "bun:test";
import { cleanModuleTitle } from "./apps/web/src/services/geminiService.ts";

const originalTitles = [
    "Introduction to TypeScript",
    "Module 1: Advanced Types",
    "",
    "   ",
    null,
    "React Hooks",
    "Testing with Bun",
    "Module 2: State Management",
    "Final Project",
    "   Module 3: Deployment   ",
];

// Replicating the logic to benchmark
function baselineProcess(titles: any[]) {
    return titles
        .map(title => typeof title === 'string' ? cleanModuleTitle(title) : "")
        .filter(title => title !== "")
        .map(title => ({ title, moduleMaterial: undefined, isLoading: false, loadingError: null }));
}

function optimizedProcess(titles: any[]) {
    return titles.reduce((acc, title) => {
        if (typeof title === 'string') {
            const cleanedTitle = cleanModuleTitle(title);
            if (cleanedTitle !== "") {
                acc.push({ title: cleanedTitle, moduleMaterial: undefined, isLoading: false, loadingError: null });
            }
        }
        return acc;
    }, []);
}

console.log("Running Benchmarks...");

// Expand the array to a large size to simulate a heavy workload and make benchmarking visible
const largeTitlesArray = [];
for (let i = 0; i < 10000; i++) {
    largeTitlesArray.push(...originalTitles);
}

const ITERATIONS = 100;

// Benchmark baseline
const startBaseline = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    baselineProcess(largeTitlesArray);
}
const endBaseline = performance.now();
const baselineTime = endBaseline - startBaseline;

// Benchmark optimized
const startOptimized = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    optimizedProcess(largeTitlesArray);
}
const endOptimized = performance.now();
const optimizedTime = endOptimized - startOptimized;

console.log(`Baseline Process: ${baselineTime.toFixed(2)}ms`);
console.log(`Optimized Process: ${optimizedTime.toFixed(2)}ms`);

const improvement = baselineTime - optimizedTime;
const improvementPercent = (improvement / baselineTime) * 100;
console.log(`Improvement: ${improvement.toFixed(2)}ms (${improvementPercent.toFixed(2)}%)`);
