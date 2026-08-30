const alertTests = require("./testAlerts");
const dashboardDataTests = require("./testDashboardData");

async function main() {
  const suites = [
    { name: "Alert engine", module: alertTests },
    { name: "Dashboard data", module: dashboardDataTests }
  ];

  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of suites) {
    console.log(`\n${suite.name}`);
    const results = await suite.module.run();
    results.forEach((result) => {
      if (result.passed) {
        totalPassed += 1;
        console.log(`  PASS  ${result.name}`);
      } else {
        totalFailed += 1;
        console.log(`  FAIL  ${result.name}`);
        console.log(`        ${result.error}`);
      }
    });
  }

  console.log(`\n${totalPassed} passed, ${totalFailed} failed\n`);
  if (totalFailed > 0) process.exit(1);
}

main();
