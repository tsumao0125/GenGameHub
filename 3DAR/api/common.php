<?php

declare(strict_types=1);

const GHOST_DB_PATH = __DIR__ . '/data/ghosts.sqlite';

function send_json(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        send_json(['ok' => false, 'error' => 'Invalid JSON body.'], 400);
    }

    return $data;
}

function ensure_storage_ready(): void
{
    $dir = dirname(GHOST_DB_PATH);
    if (!is_dir($dir) && !mkdir($dir, 0777, true) && !is_dir($dir)) {
        send_json(['ok' => false, 'error' => 'Could not create storage directory.'], 500);
    }
}

function get_db(): PDO
{
    ensure_storage_ready();

    try {
        $pdo = new PDO('sqlite:' . GHOST_DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS ghosts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ghost_id TEXT NOT NULL UNIQUE,
                course_key TEXT NOT NULL,
                lap_count INTEGER NOT NULL,
                total_time_ms INTEGER NOT NULL,
                data_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )'
        );
        return $pdo;
    } catch (Throwable $e) {
        send_json(['ok' => false, 'error' => 'Database is not available.'], 500);
    }
}

function create_ghost_id(PDO $pdo, int $length = 6): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $max = strlen($alphabet) - 1;

    do {
        $ghostId = '';
        for ($i = 0; $i < $length; $i += 1) {
            $ghostId .= $alphabet[random_int(0, $max)];
        }

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM ghosts WHERE ghost_id = :ghost_id');
        $stmt->execute(['ghost_id' => $ghostId]);
    } while ((int)$stmt->fetchColumn() > 0);

    return $ghostId;
}
