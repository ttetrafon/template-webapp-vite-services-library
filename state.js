import { cloneDeep } from "lodash";
import { generalNames } from "../data-library/enums.js";
import { jsonRequest } from '../helper-library/requests.js';
import { roles, User } from "../model/user.js";

class State {
  #observables = {};
  #gameConnection = generalNames.CONNECTION_SOLO;

  constructor() {
    if (!State.instance) {
      State.instance = this;
    }

    let userUuid = Math.random();
    userUuid = crypto.randomUUID();
    this.createObservable(
      generalNames.OBSERVABLE_USER.description,
      new User(userUuid, roles.VISITOR)
    );

    return State.instance;
  }

  /**
   *
   * @param {String} observable
   * @param {Object} obj
   */
  createObservable(observable, obj) {
    let onChange = (property, newValue) => {
      // console.log(`Property '${property}' changed to:`, newValue, "... calling subscribers!");
      Object.keys(this.#observables[observable].listeners).forEach(subscriber =>
        this.#observables[observable].listeners[subscriber](subscriber, property, newValue)
      );
    };

    let proxy = new Proxy(obj, {
      get(target, prop, receiver) {
        const value = target[prop];
        if (value instanceof Function) {
          return function(...args) {
            return value.apply(this === receiver ? target : this, args);
          };
        }
        return value;
      },
      set(target, prop, value, receiver) {
        if (target[prop] !== value) {
          onChange(prop, value);
        }
        return Reflect.set(target, prop, value, receiver);
      },
      deleteProperty(target, prop) {
        onChange(prop, undefined);
        return Reflect.deleteProperty(target, prop);
      }
    });

    this.#observables[observable] = {
      proxy: proxy,
      listeners: {}
    }
  }

  /**
   *
   * @param {String} url
   * @param {String} observableName
   * @returns
   */
  async getDataFromServer(url, observableName) {
    // console.log(`---> getDataFromServer(${url})`);
    let res = await jsonRequest(url);

    if (res.completionCode == 0) {
      delete res.completionCode;
      delete res.completionMessage;
      this.createObservable(observableName, res);
    }
    else {
      // TODO: display appropriate error!
      res = {};
    }

    return res;
  }

  /**
   *
   * @param {String} observable
   * @param {String} prop
   * @returns
   */
  async getValueFromObservable(observable, prop) {
    // console.log(`---> getValueFromObservable(${observable}, ${prop})`);
    if (this.#observables.hasOwnProperty(observable)) {
      let value = this.#observables[observable].proxy[prop];
      return cloneDeep(value);
    }
    return null;
  }

  /**
   *
   * @param {URL} url
   */
  async pingServer(url) {
    await jsonRequest(url);
  }

  /**
   * Publish a message to the server.
   * Depending on the gameConnection, publish to
   *  - web-sockets (live)
   *  - api (solo)
   *  - nowhere, keep a list of commands used, and update the local data directly (offline) [TODO: all data will be synchronised when switching to another game mode]
   * @param {Symbol} type
   * @param {Object} message
   */
  async publishMessage(url, message, method) {
    // console.log(`---> publishMessage(${url}, ${JSON.stringify(message)})`);
    switch(this.#gameConnection) {
      case generalNames.CONNECTION_LIVE:
        console.log("... ws");
        break;
      case generalNames.CONNECTION_SOLO:
        console.log("... api");
        return await jsonRequest(url, message, method);
      default: // generalNames.CONNECTION_OFFLINE:
        console.log("... local");
        break;
    }
  }

  /**
   *
   * @param {String} observable: the name of the object
   * @param {String} subscriber: the name of the subscriber
   * @param {Function} callback: the function called in the subscriber when the
   */
  async subscribeToObservable(observable, subscriber, callback) {
    if (this.#observables.hasOwnProperty(observable) && !this.#observables[observable].listeners.hasOwnProperty(subscriber)) {
      this.#observables[observable].listeners[subscriber] = callback;
    }
  }

  async unsubscribeFromObservable(observable, subscriber) {
    if (this.#observables.hasOwnProperty(observable) && this.#observables[observable].listeners.hasOwnProperty(subscriber)) {
      delete this.#observables[observable].listeners[subscriber];
    }
  }

  /**
   *
   * @param {String} observable The name of the observable object.
   * @param {String} prop The name of the key in the object to update.
   * @param {Object} value
   */
  async updateObservable(observable, prop, value) {
    // console.log(`---> updateObservable(${observable}, ${prop}, ${JSON.stringify(value)})`);
    // let s = await this.getValueFromObservable(observable, prop);
    // console.log(s, value);
    if (this.#observables.hasOwnProperty(observable)) {
      this.#observables[observable].proxy[prop] = value;
    }
  }
}

const instance = new State();
Object.freeze(instance);
export default instance;