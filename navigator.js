import { domainRoot } from '../data/config.js';
import { eventNames } from '../data/enums.js';
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
      // console.log(`... received navigation event: ${JSON.stringify(e.detail)}`);
      this.navigateTo(e.detail.target, true, e.detail.data ? e.detail.data : {});
    });

    window.addEventListener(eventNames.SUB_PAGE_CONTAINER.description, (e) => {
      e.stopImmediatePropagation();
      // console.log(eventNames.SUB_PAGE_CONTAINER.description, e.detail);
      this.$subPageContainers[e.detail.route] = e.detail.container;
    });

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
      console.log("dialog event:", eventNames.DIALOG_CONFIRM.description)
      event.stopImmediatePropagation();
      this.dialog.close();
      await this.$dialogConfirmCallback(event.detail.data);

      this.$dialogCancelCallback = () => { };
      this.$dialogConfirmCallback = () => { };
    });
    this.dialog.addEventListener(eventNames.DIALOG_CANCEL.description, async (event) => {
      console.log("dialog event:", eventNames.DIALOG_CANCEL.description)
      event.stopImmediatePropagation();
      this.dialog.close();
      await this.$dialogCancelCallback();

      this.$dialogCancelCallback = () => { };
      this.$dialogConfirmCallback = () => { };
    });
    this.dialog.addEventListener('cancel', async (event) => {
      console.log("dialog event: cancel");
      event.stopImmediatePropagation();
      this.dialog.close();
      await this.$dialogCancelCallback();

      this.$dialogCancelCallback = () => { };
      this.$dialogConfirmCallback = () => { };
    });
  }

  createCanonicalUrl(path) {
    return `${ domainRoot }/${ path }`;
  }

  createContentElement(content) {
    return `<${ content }></${ content }>`;
  }

  getRoute(route) {
    let alias = aliases[route];
    if (!alias) alias = route;

    if (!routes[alias]) alias = "/404";

    let r = routes[alias];
    return {
      content: this.createContentElement(r.content),
      title: r.title,
      description: r.description,
      canonicalUrl: this.createCanonicalUrl(r.path),
      structuredData: {
        // https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
        // https://developers.google.com/search/docs/appearance/structured-data/search-gallery
        "@context": "https://schema.org",
        "@type": r.pathType,
        name: r.title,
        description: r.description,
        url: this.createCanonicalUrl(r.path),
        subroute: r.subroute
      },
      subroute: r.subroute,
      navData: r.navData
    };
  }

  navigateTo(path, pushState = true, stateData = {}) {
    // console.log(`navigateTo(${path}, ${pushState}, ${JSON.stringify(stateData)})`);
    path = this.normalisePath(path);
    const route = this.getRoute(path);
    this.updateContent(path, route.subroute, route.content, route.navData);
    this.updateMetadata(route);
    if (pushState) {
      window.history.pushState({}, '', path);
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

  updateContent(path, isSubroute, content, navData) {
    // console.log(`--> updateContent(${path}, ${isSubroute}, ${content})`);
    if (checkStringForNonExistence(content)) return;

    if (!isSubroute) {
      this.container.innerHTML = content;
      if (navData) this.container.firstChild.setAttribute("nav-data", JSON.stringify(navData));
      return;
    }

    const elements = path.split("/");
    const elementsNum = elements.length;
    const parentPath = "/" + elements[elementsNum - 2];
    const parentContainer = this.$subPageContainers[parentPath];
    // console.log(parentPath, parentContainer);

    if (!parentContainer) {
      this.navigateTo(parentPath);

      setTimeout(() => {
        this.navigateTo(path);
      }, 100);
    }
    else {
      parentContainer.innerHTML = content;
    }
  }

  updateMetadata(route) {
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
