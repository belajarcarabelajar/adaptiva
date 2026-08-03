import { performance } from 'perf_hooks';

const iterations = 100000;

type ModuleCompletionStatus = { summaryLoaded: boolean; quizTaken: boolean };

// Mock data
const moduleCompletionStatus: Record<string, ModuleCompletionStatus> = {};
for (let i = 0; i < 100; i++) {
  moduleCompletionStatus[`module_${i}`] = {
    summaryLoaded: Math.random() > 0.5,
    quizTaken: Math.random() > 0.5
  };
}

const planTaskCompletionStatus: Record<string, boolean> = {};
for (let i = 0; i < 100; i++) {
  planTaskCompletionStatus[i] = Math.random() > 0.5;
}

const currentItem = {
  moduleCompletionStatus,
  planTaskCompletionStatus,
};

function runOriginal() {
  let summaries = 0;
  let quizzes = 0;
  let tasks = 0;
  for (let i = 0; i < iterations; i++) {
    summaries = Object.values(currentItem.moduleCompletionStatus).filter((s: ModuleCompletionStatus) => s.summaryLoaded).length;
    quizzes = Object.values(currentItem.moduleCompletionStatus).filter((s: ModuleCompletionStatus) => s.quizTaken).length;
    tasks = Object.values(currentItem.planTaskCompletionStatus).filter(s => s).length;
  }
  return { summaries, quizzes, tasks };
}

function runOptimized() {
  let summaries = 0;
  let quizzes = 0;
  let tasks = 0;
  for (let i = 0; i < iterations; i++) {
    const counts = Object.values(currentItem.moduleCompletionStatus).reduce((acc: { summaries: number; quizzes: number }, status: ModuleCompletionStatus) => {
        if (status.summaryLoaded) acc.summaries++;
        if (status.quizTaken) acc.quizzes++;
        return acc;
    }, { summaries: 0, quizzes: 0 });
    summaries = counts.summaries;
    quizzes = counts.quizzes;

    tasks = Object.values(currentItem.planTaskCompletionStatus).reduce((count: number, status: boolean) => count + (status ? 1 : 0), 0);
  }
  return { summaries, quizzes, tasks };
}

function runOptimizedForLoop() {
  let summaries = 0;
  let quizzes = 0;
  let tasks = 0;
  for (let i = 0; i < iterations; i++) {
    let s = 0;
    let q = 0;
    for (const status of Object.values(currentItem.moduleCompletionStatus)) {
        if (status.summaryLoaded) s++;
        if (status.quizTaken) q++;
    }
    summaries = s;
    quizzes = q;

    let t = 0;
    for (const status of Object.values(currentItem.planTaskCompletionStatus)) {
        if (status) t++;
    }
    tasks = t;
  }
  return { summaries, quizzes, tasks };
}

console.info("Warming up...");
runOriginal();
runOptimized();
runOptimizedForLoop();

console.time("Original");
runOriginal();
console.timeEnd("Original");

console.time("Optimized (reduce)");
runOptimized();
console.timeEnd("Optimized (reduce)");

console.time("Optimized (for loop)");
runOptimizedForLoop();
console.timeEnd("Optimized (for loop)");
