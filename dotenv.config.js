const path = require("path");
const envFile = process.env.ENV_FILE || ".env.dev";
require("dotenv").config({ path: path.resolve(process.cwd(), envFile) });
