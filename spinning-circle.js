import { eventNames } from "../data/enums.js";

const spinningCircle = document.createElement("loading-circle");
document.body.appendChild(spinningCircle);
spinningCircle.classList.add("hidden");

document.addEventListener(eventNames.TOGGLE_SPINNING_CIRCLE.description, (event) => {
  event.stopPropagation();
  spinningCircle.classList.toggle("hidden", !event.detail.state);
});
