const steps = [
  "1) npm run dev",
  "2) Open http://localhost:3000 in a browser and click Authorize.",
  "3) In Discord #ai-dj: 'play get lucky' and confirm audio + toast.",
  "4) 'switch to focus' and confirm vibe toast + queue shift.",
  "5) 'what's playing' and verify reply matches screen.",
  "6) Ask a random question and confirm short reply."
];

console.log("PromptDJ smoke checklist:\n");
steps.forEach((s) => console.log(s));
console.log("\nIf any step fails, check docs/TROUBLESHOOTING.md.");
