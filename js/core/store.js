/**
 * store.js - winziger Redux-artiger Store.
 *
 * Bewusst framework-frei gehalten: Der Spielzustand liegt damit in einer
 * Form vor, die sich spaeter unveraendert in einen React-Reducer
 * (useReducer / zustand) uebernehmen laesst.
 */
window.PG = window.PG || {};

/**
 * @param {Object} initialState
 * @param {(state: Object, action: {type: string}) => Object} reducer
 */
PG.createStore = function (initialState, reducer) {
  'use strict';

  var state = initialState;
  var listeners = [];

  function getState() {
    return state;
  }

  /**
   * Fuehrt eine Action aus. Der Reducer muss einen NEUEN Zustand liefern.
   * @param {{type: string}} action
   */
  function dispatch(action) {
    var next = reducer(state, action);
    if (next === state) return state;
    var previous = state;
    state = next;
    listeners.slice().forEach(function (fn) { fn(state, previous, action); });
    return state;
  }

  /** Setzt den Zustand direkt (z. B. beim Laden aus dem LocalStorage). */
  function replace(nextState) {
    var previous = state;
    state = nextState;
    listeners.slice().forEach(function (fn) { fn(state, previous, { type: '@@replace' }); });
    return state;
  }

  /**
   * Registriert einen Listener.
   * @returns {() => void} Funktion zum Abmelden
   */
  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  return {
    getState: getState,
    dispatch: dispatch,
    replace: replace,
    subscribe: subscribe
  };
};
