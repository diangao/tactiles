import "./ui/styles.css";
import { mount } from "./ui/workbench";

const root = document.getElementById("app");
if (root) void mount(root);
