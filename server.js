const { createGateway } = require("./lib/frps/server");

const serviceId = process.env.STACKEDGE_FRPS_SERVICE_ID;
const token = process.env.STACKEDGE_FRPS_TOKEN;

if (!serviceId || !token) {
  console.error("Set STACKEDGE_FRPS_SERVICE_ID and STACKEDGE_FRPS_TOKEN before starting.");
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
const gateway = createGateway({
  serviceId,
  token,
  application: process.env.STACKEDGE_FRPS_APP || "app"
});

gateway.server.listen(port, () => {
  console.log(`Stackedge FRPS listening on port ${port}`);
});
