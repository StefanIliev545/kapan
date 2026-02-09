const COW_API = "https://api.cow.fi/arbitrum_one/api/v1";
const APP_DATA_HASH = "0xb53535a7a23ac21e9631d684fd982775db3d8a6858886313c297d9c97ad2ad4f";

async function main() {
  console.log("Checking appData registration...\n");

  // Check if appData is registered
  const response = await fetch(`${COW_API}/app_data/${APP_DATA_HASH}`);
  console.log("Status:", response.status);
  const text = await response.text();
  console.log("Response:", text);

  if (response.status === 404) {
    console.log("\nAppData NOT registered! Need to push it.");
  } else if (response.ok) {
    console.log("\nAppData IS registered.");
  }
}

main().catch(console.error);
