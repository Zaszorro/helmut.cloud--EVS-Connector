import Catalog from "./lib/Catalog";
import HttpClient from "./lib/nodes/HttpClient";

export default new Catalog(
    "example name",
    "example description",
    "https://app.helmut.cloud/img/logo_white.webp",
    "1.5.0-dev-6",
    HttpClient
);
