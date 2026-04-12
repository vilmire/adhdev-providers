'use strict';

const { buildPtyWrite } = require('./helpers.js');

module.exports = function setYolo(input) {
  const nextValue = !!input?.args?.value;
  return buildPtyWrite('/yolo', {
    controlValues: {
      yolo: nextValue,
    },
  });
};
