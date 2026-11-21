import test from "node:test";
import assert from "node:assert/strict";
import { groupPins, nearbyStops, pinLabel } from "./mapPins.js";

test("같은 자리 배송지는 핀 하나로 묶고 번호를 함께 보여 준다", () => {
  const spots = groupPins(
    [
      { lat: 37.5, lng: 127, index: -1, label: "출발" },
      { lat: 37.51, lng: 127.01, index: 0, label: "1" },
      { lat: 37.52, lng: 127.02, index: 2, label: "3" },
      { lat: 37.520001, lng: 127.020001, index: 1, label: "2" },
      { lat: 37.5, lng: 127, index: 3, label: "귀가" },
    ],
    3,
  );
  assert.equal(spots.length, 3);
  assert.deepEqual(spots[2].stops, [1, 2]);
  assert.equal(spots[2].label, "2·3");
  assert.deepEqual(spots[0].ends, ["출발", "귀가"]);
  assert.equal(spots[0].label, "출발·귀가");
});

test("출발지와 같은 자리 배송지는 배송지 번호가 보인다", () => {
  const spots = groupPins([
    { lat: 37.5, lng: 127, index: -1, label: "출발" },
    { lat: 37.5, lng: 127, index: 0, label: "1" },
  ], 1);
  assert.equal(spots.length, 1);
  assert.equal(spots[0].label, "1");
});

test("번호가 많으면 줄여서 보여 준다", () => {
  assert.equal(pinLabel(["1", "2", "3"]), "1·2·3");
  assert.equal(pinLabel(["1", "2", "3", "4", "5"]), "1·2 외 3");
});

test("화면에서 겹쳐 보이는 배송지를 함께 찾는다", () => {
  const spots = groupPins([
    { lat: 37.5, lng: 127, index: 0, label: "1" },
    { lat: 37.5002, lng: 127, index: 1, label: "2" }, // 약 22m
    { lat: 37.6, lng: 127, index: 2, label: "3" },
  ], 3);
  const at = { lat: 37.5, lng: 127 };
  assert.deepEqual(nearbyStops(spots, at, 12), [0, 1]); // 멀리서 보면 겹침
  assert.deepEqual(nearbyStops(spots, at, 18), [0]); // 확대하면 따로
});
