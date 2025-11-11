import Catalog from "./lib/Catalog";
import EVSConnector from "./lib/nodes/EVSConnector";

export default new Catalog(
    "EVS Connector",
    "Node catalogto cennect to EVS",
    "https://app.helmut.cloud/img/logo_white.webp",
    "1.6.0",
    EVSConnector
);
