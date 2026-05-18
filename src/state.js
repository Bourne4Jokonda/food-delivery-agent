// src/state.js — хранение сессий
const states = new Map();

module.exports = {
  getState: (userId) => {
    if (!states.has(userId)) {
      states.set(userId, { step: 'items', data: {} });
    }
    return states.get(userId);
  },
  updateState: (userId, newState) => states.set(userId, newState),
  clearState: (userId) => states.set(userId, { step: 'items', data: {} })
};