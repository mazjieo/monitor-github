import { refreshTrending } from "../github.js";
import { exportStaticData } from "../export-static.js";

try {
  const result = await refreshTrending();
  const exported = exportStaticData(result);
  console.log(JSON.stringify({ ...result, exported }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
