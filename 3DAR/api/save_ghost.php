<?php

declare(strict_types=1);

require __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$input = read_json_body();
$courseKey = trim((string)($input['course_key'] ?? ''));
$lapCount = (int)($input['lap_count'] ?? 0);
$totalTimeMs = (int)($input['total_time_ms'] ?? 0);
$samples = $input['samples'] ?? null;

if ($courseKey === '' || $lapCount < 1 || $totalTimeMs < 1 || !is_array($samples) || count($samples) < 2) {
    send_json(['ok' => false, 'error' => 'Missing or invalid ghost data.'], 400);
}

if (count($samples) > 15000) {
    send_json(['ok' => false, 'error' => 'Ghost data is too large.'], 400);
}

$encodedSamples = json_encode($samples, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($encodedSamples === false || strlen($encodedSamples) > 2_000_000) {
    send_json(['ok' => false, 'error' => 'Ghost payload is too large.'], 400);
}

$pdo = get_db();
$ghostId = create_ghost_id($pdo);

$stmt = $pdo->prepare(
    'INSERT INTO ghosts (ghost_id, course_key, lap_count, total_time_ms, data_json, created_at)
     VALUES (:ghost_id, :course_key, :lap_count, :total_time_ms, :data_json, :created_at)'
);

$stmt->execute([
    'ghost_id' => $ghostId,
    'course_key' => $courseKey,
    'lap_count' => $lapCount,
    'total_time_ms' => $totalTimeMs,
    'data_json' => $encodedSamples,
    'created_at' => gmdate('c')
]);

send_json([
    'ok' => true,
    'ghost_id' => $ghostId
]);
