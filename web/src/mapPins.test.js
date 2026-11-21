import test from "node:test";
import assert from "node:assert/strict";
import { groupPins, pinLabel, clusterSpots } from "./mapPins.js";

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

test("화면에서 겹치는 핀은 지금 확대 정도에 맞춰 하나로 묶는다", () => {
  const spots = groupPins([
    { lat: 37.5, lng: 127, index: -1, label: "출발" },
    { lat: 37.3955, lng: 127.1104, index: 2, label: "3" },
    { lat: 37.3955, lng: 127.1104, index: 3, label: "4" },
    { lat: 37.3942, lng: 127.11, index: 4, label: "5" }, // 약 150m
    { lat: 37.2708, lng: 127.4385, index: 5, label: "6" },
  ], 6);
  const far = clusterSpots(spots, 11);
  assert.deepEqual(far.filter((s) => s.stops.length).map((s) => s.label), ["3·4·5", "6"]);
  assert.equal(far.filter((s) => !s.stops.length).length, 1); // 출발 핀은 그대로
  const close = clusterSpots(spots, 17);
  assert.deepEqual(close.filter((s) => s.stops.length).map((s) => s.label), ["3·4", "5", "6"]);
});
