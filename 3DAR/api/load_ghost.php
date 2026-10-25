<?php

declare(strict_types=1);

require __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$ghostId = strtoupper(trim((string)($_GET['id'] ?? '')));
if ($ghostId === '') {
    send_json(['ok' => false, 'error' => 'Ghost ID is required.'], 400);
}

$pdo = get_db();
$stmt = $pdo->prepare(
    'SELECT ghost_id, course_key, lap_count, total_time_ms, data_json, created_at
     FROM ghosts
     WHERE ghost_id = :ghost_id
     LIMIT 1'
);
$stmt->execute(['ghost_id' => $ghostId]);
$row = $stmt->fetch();

if (!$row) {
    send_json(['ok' => false, 'error' => 'Ghost not found.'], 404);
}

$samples = json_decode((string)$row['data_json'], true);
if (!is_array($samples)) {
    send_json(['ok' => false, 'error' => 'Stored ghost data is invalid.'], 500);
}

send_json([
    'ok' => true,
    'ghost' => [
        'ghost_id' => $row['ghost_id'],
        'course_key' => $row['course_key'],
        'lap_count' => (int)$row['lap_count'],
        'total_time_ms' => (int)$row['total_time_ms'],
        'created_at' => $row['created_at'],
        'samples' => $samples
    ]
]);
