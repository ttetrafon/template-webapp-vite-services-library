import { domainRoot } from '../data/config.js';
import { eventNames } from '../data-library/enums.js';
import { routes, aliases } from '../data/routes.js';
import { checkStringForExistence, checkStringForNonExistence } from '../helper-library/data.js';
import { clearChildren } from '../helper-library/dom.js';

export class Navigator {
  constructor(containerId) {
    this.container = document.querySelector(containerId);

    this.$subPageContainers = {};

    this.init();
  }

  init() {
    // Handle initial load
    this.navigateTo(window.location.pathname, false);

    // Handle back/forward navigation
    window.addEventListener('popstate', () => {
      this.navigateTo(window.location.pathname, false);
    });

    // Listen for custom navigate events
    window.addEventListener(eventNames.NAVIGATE.description, (e) => {
      // console.log(`... received navigation event:`, e.detail);
      this.navigateTo(e.detail.target, true, e.detail.stateData ? e.detail.stateData : {});
    });

    // window.addEventListener(eventNames.SUB_PAGE_CONTAINER.description, (e) => {
    //   e.stopImmediatePropagation();
    //   // console.log(eventNames.SUB_PAGE_CONTAINER.description, e.detail);
    //   this.$subPageContainers[e.detail.route] = e.detail.container;
    // });

    this.dialog = document.createElement('dialog');
    const body = document.querySelector("body");
    body.appendChild(this.dialog);

    window.addEventListener(eventNames.DIALOG_OPEN.description, (e) => {
      e.stopImmediatePropagation();
      clearChildren(this.dialog);

      this.$dialogConfirmCallback = e.detail.confirmCb ? e.detail.confirmCb : () => { };
      this.$dialogCancelCallback = e.detail.cancelCb ? e.detail.cancelCb : () => { };

      let el = document.createElement(e.detail.element);
      for (const [key, value] of Object.entries(e.detail.data)) {
        el.setAttribute(key, JSON.stringify(value));
      }
      this.dialog.appendChild(el);

      this.dialog.showModal();
    });
    this.dialog.addEventListener(eventNames.DIALOG_CONFIRM.description, async (event) => {
      // console.log("dialog event:", eventNames.DIALOG_CONFIRM.description)
      event.stopImmediatePropagation();
      this.dialog.close();
      await this.$dialogConfirmCallback(event.detail.data);

      this.$dialogCancelCallback = () => { };
      this.$dialogConfirmCallback = () => { };
    });
    this.dialog.addEventListener(eventNames.DIALOG_CANCEL.description, async (event) => {
      // console.log("dialog event:", eventNames.DIALOG_CANCEL.description)
      event.stopImmediatePropagation();
      this.dialog.close();
      await this.$dialogCancelCallback();

      this.$dialogCancelCallback = () => { };
      this.$dialogConfirmCallback = () => { };
    });
    this.dialog.addEventListener('cancel', async (event) => {
      // console.log("dialog event: cancel");
      event.stopImmediatePropagation();
      this.dialog.close();
      await this.$dialogCancelCallback();

      this.$dialogCancelCallback = () => { };
      this.$dialogConfirmCallback = () => { };
    });
  }

  cleanContainers(newPathParts, currentPathParts) {
    // console.log(`---> cleanContainers(${ JSON.stringify(newPathParts) }, ${ JSON.stringify(currentPathParts) })`);
    for (let newPart of newPathParts) {
      if (!currentPathParts.includes(newPart)) {
        delete this.$subPageContainers[newPart];
      }
    }
    // console.log(`... this.$subPageContainers:`, this.$subPageContainers);
  }

  createCanonicalUrl(path) {
    // console.log(`---> createCanonicalUrl(${ path })`);
    return `${ domainRoot }/${ path }`;
  }

  createContentElement(content) {
    return `<${ content }></${ content }>`;
  }

  getRoute(route, pathParts) {
    let r = routes[route];
    return {
      content: this.createContentElement(r.content),
      title: r.title,
      description: r.description,
      canonicalUrl: this.createCanonicalUrl(pathParts.join("/")),
      structuredData: {
        // https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
        // https://developers.google.com/search/docs/appearance/structured-data/search-gallery
        "@context": "https://schema.org",
        "@type": r.pathType,
        name: r.title,
        description: r.description,
        url: this.createCanonicalUrl(r.path)
      },
      navData: r.navData
    };
  }

  navigateTo(path, pushState = true, stateData = {}) {
    // console.log(`navigateTo(${ path }, ${ pushState }, ${ JSON.stringify(stateData) })`);

    const currentPath = window.location.pathname;
    const currentPathParts = currentPath.split("/").filter(Boolean);
    // console.log(`... currentPath = ${ currentPath }`, currentPathParts);

    let newPath = this.normalisePath(path);
    if (newPath == "/") {
      newPath = aliases["/"];
    }
    const newPathParts = newPath.split("/").filter(Boolean);
    const numberOfPathParts = newPathParts.length;
    // console.log(`... new path = ${ newPath }}`, newPathParts, numberOfPathParts);

    let parentContainer = this.container;
    for (let i = 0; i < numberOfPathParts; i++) {
      let part = newPathParts[i];
      let route = this.getRoute(part, newPathParts);
      // console.log("...", part, route);

      if (part != currentPathParts[i] || !parentContainer.firstChild) {
        // console.log(`... updating part: ${part}`);
        this.updateContent(parentContainer, route.content, route.navData);
      }
      // else {
      //   console.log(`... skipping part: ${part}`);
      // }
      parentContainer = "declareSubContainer" in parentContainer.firstChild ? parentContainer.firstChild.declareSubContainer() : null;

      if (i == numberOfPathParts - 1) {
        this.updateMetadata(route);
      }
    }

    if (pushState) {
      window.history.pushState({}, '', newPath);
    }
  }

  normalisePath(path) {
    // console.log(`---> normalisePath(${ path })`);
    if (path == "/") return path;
    if (path == "") return "/";
    if (path[path.length - 1] == "/") path = path.slice(0, -1);
    return path;
  }

  updateCanonicalUrl(value) {
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel
    if (checkStringForNonExistence(value)) return;

    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", value);
  }

  updateContent(parentContainer, content, navData) {
    // console.log(`--> updateContent()`, parentContainer, content, navData);
    if (checkStringForNonExistence(content) || !parentContainer) return;

    parentContainer.innerHTML = content;
    if (navData) parentContainer.firstChild.setAttribute("nav-data", JSON.stringify(navData));
  }

  updateMetadata(route) {
    // console.log(`--> updateMetadata()`, route);
    if (checkStringForExistence(route.title)) document.title = route.title;
    if (checkStringForExistence(route.description)) document.querySelector('meta[name="description"]').setAttribute('content', route.description);
    this.updateCanonicalUrl(route.canonicalUrl);
    this.updateStructuredData(route.structuredData);
  }

  updateStructuredData(data) {
    if (data == null || data == undefined) return;

    const existingScript = document.querySelector('script[type="application/ld+json"]');
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }
}
