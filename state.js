import { cloneDeep } from "lodash";
import { generalNames } from "../data-library/enums.js";
import { jsonRequest } from '../helper-library/requests.js';
import { roles, User } from "../model/user.js";

class State {
  #observables = {};
  #gameConnection = generalNames.CONNECTION_SOLO;
  #observablesBroadcastChannel;
  #pageRunAt;
  #requestedState = false;

  constructor() {
    if (!State.instance) {
      State.instance = this;
    }

    this.#pageRunAt = new Date().valueOf();
    console.log(this.#pageRunAt);

    this.#observablesBroadcastChannel = new BroadcastChannel('my_app_channel');
    this.#observablesBroadcastChannel.onmessage = (event) => {
      this.receiveBroadcastedMessage(event);
    }

    let userUuid = Math.random();
    userUuid = crypto.randomUUID();
    this.createObservable(
      generalNames.OBSERVABLE_USER.description,
      new User(userUuid, "", roles.VISITOR.description),
      false
    );

    // console.log("state.#observables:", this.#observables, cloneDeep(this.#observables[generalNames.OBSERVABLE_USER.description].proxy));
    this.#requestedState = true;
    this.broadcastMessage({
      type: generalNames.BROADCAST_TYPE_REQUEST_STATE.description,
      time: this.#pageRunAt
    });
    this.collectState();
    return State.instance;
  }

  /**
   *
   * @param {Object} msg
   */
  async broadcastMessage(msg) {
    this.#observablesBroadcastChannel.postMessage(JSON.stringify(msg));
  }

  collectState() {
    console.log(`---> collectState()`);
    let state = {};
    let keys = Object.keys(this.#observables);
    for (let i = 0; i < keys.length; i++) {
      state[keys[i]] = cloneDeep(this.#observables[keys[i]].proxy);
    }
    // console.log(state);
    return state;
  }

  /**
   * Create an observable for others to listen to.
   * @param {String} observable
   * @param {Object} obj
   */
  createObservable(observable, obj, broadcastCreation = true) {
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

    if (broadcastCreation) this.broadcastMessage({
      type: generalNames.BROADCAST_TYPE_CREATE_OBSERVABLE.description,
      name: observable,
      data: obj
    });
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

  async getObservable(observable) {
    console.log(`---> getObservable(${observable})`);
    if (this.#observables.hasOwnProperty(observable)) {
      return cloneDeep(this.#observables[observable].proxy);
    } else {
      return {};
    }
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

  async receiveBroadcastedMessage(event) {
    console.log(`---> receiveBroadcastedMessage()`, event);
    let msg = JSON.parse(event.data);
    console.log("msg:", msg);
    switch(msg.type) {
      case generalNames.BROADCAST_TYPE_REQUEST_STATE.description:
        // if the request is from an older page, ignore it
        if (msg.time < this.#pageRunAt) return;
        // then collect all state data and send them!
        this.broadcastMessage({
          type: generalNames.BROADCAST_TYPE_RECEIVE_STATE.description,
          state: this.collectState()
        });
        break;
      case generalNames.BROADCAST_TYPE_RECEIVE_STATE.description:
        if (!this.#requestedState) return;

        this.#requestedState = false;
        let keys = Object.keys(msg.state);

        for (let i = 0; i < keys.length; i++) {
          let key = keys[i];
          let data = msg.state[key];
          if (this.#observables.hasOwnProperty(key)) {
            let props = Object.keys(data);
            for (let j = 0; j < props.length; j++) {
              let prop = props[j];
              this.updateObservable(key, prop, data[prop], false);
            }
          } else {
            this.createObservable(key, data, false);
          }
        }
        break;
      case generalNames.BROADCAST_TYPE_CREATE_OBSERVABLE.description:
        this.createObservable(msg.name, msg.data, false);
        break;
      case generalNames.BROADCAST_TYPE_UPDATE_OBSERVABLE.description:
        this.updateObservable(msg.observable, msg.prop, msg.value, false);
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
    // console.log(this.#observables[observable]);
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
  async updateObservable(observable, prop, value, broadcastChange = true) {
    // console.log(`---> updateObservable(${observable}, ${prop}, ${JSON.stringify(value)})`);
    let s = await this.getValueFromObservable(observable, prop);
    if (this.#observables.hasOwnProperty(observable)) {
      this.#observables[observable].proxy[prop] = value;
      if (broadcastChange) this.broadcastMessage({
        type: generalNames.BROADCAST_TYPE_UPDATE_OBSERVABLE.description,
        observable: observable,
        prop: prop,
        value: value
      });
    }
    // console.log(this.#observables[observable]);
  }
}

const instance = new State();
Object.freeze(instance);
export default instance;