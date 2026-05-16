import { refreshTrending } from "../github.js";

try {
  const result = await refreshTrending();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
