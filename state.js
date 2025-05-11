import { gameServiceUrl } from "../data/config.js";
import { generalNames } from "../data/enums.js";
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
    try {
      userUuid = crypto.randomUUID();
    } catch(err) {}
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
      console.log(`Property '${property}' changed to:`, newValue, "... calling subscribers!");
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
   * @param {String} section
   * @param {Array[String]} items
   */
  async getGameplayData(section) {
    console.log(`---> getGameplayData(${section})`);
    // TODO: check local storage...
    let res = await jsonRequest(`${gameServiceUrl}/data/gameplay-data/${section}`);

    if (res.completionCode == 0) {
      delete res.completionCode;
      delete res.completionMessage;
      this.createObservable(section, res);
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
      return this.#observables[observable].proxy[prop];
    }
    return null;
  }

  async pingServer() {
    await jsonRequest(`${gameServiceUrl}/`);
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
  async publishMessage(type, message) {
    console.log(`---> publishMessage(${type.description}, ${JSON.stringify(message)})`);
    switch(this.#gameConnection) {
      case generalNames.CONNECTION_LIVE:
        console.log("... ws");
        break;
      case generalNames.CONNECTION_SOLO:
        console.log("... api");
        break;
      case generalNames.CONNECTION_OFFLINE:
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
  subscribeToObservable(observable, subscriber, callback) {
    if (this.#observables.hasOwnProperty(observable) && !this.#observables[observable].listeners.hasOwnProperty(subscriber)) {
      this.#observables[observable].listeners[subscriber] = callback;
    }
  }

  unsubscribeFromObservable(observable, subscriber) {
    if (this.#observables.hasOwnProperty(observable) && this.#observables[observable].listeners.hasOwnProperty(subscriber)) {
      delete this.#observables[observable].listeners[subscriber];
    }
  }

  updateObservable(observable, prop, value) {
    if (this.#observables.hasOwnProperty(observable)) {
      this.#observables[observable].proxy[prop] = value;
    }
  }
}

const instance = new State();
Object.freeze(instance);
export default instance;