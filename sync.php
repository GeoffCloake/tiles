<?php
// sync.php — minimal turn-based multiplayer relay for the Tiles game.
// Each game "room" is stored as a JSON file under rooms/. No database needed.
// Written for PHP 7.4+ (works on shared hosting).
//
// The server is a "dumb mailbox": the phone whose turn it is computes the move
// locally (reusing all the game's JS logic) and pushes the full game snapshot
// here; everyone else polls and adopts it. See assets/js/net/ for the client.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

define('ROOM_TTL', 43200);   // delete rooms idle for > 12h
define('MAX_STATE', 500000); // reject state snapshots larger than ~500KB
define('MAX_PLAYERS', 4);

$ROOMS = __DIR__ . '/rooms';

function out($data) { echo json_encode($data); exit; }
function fail($error, $extra = array()) { out(array_merge(array('ok' => false, 'error' => $error), $extra)); }
function ok($data = array()) { out(array_merge(array('ok' => true), $data)); }

function ensure_rooms($dir) {
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    // Block direct web access to the room files (they contain player tokens).
    $ht = $dir . '/.htaccess';
    if (!file_exists($ht)) {
        @file_put_contents($ht,
            "Require all denied\n" .
            "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    if (!file_exists($dir . '/index.html')) { @file_put_contents($dir . '/index.html', ''); }
}

function sanitize_code($code) {
    $code = strtoupper(trim((string)$code));
    return preg_match('/^[A-Z0-9-]{1,16}$/', $code) ? $code : null;
}

function room_path($dir, $code) { return $dir . '/' . $code . '.json'; }
function gen_token() { return bin2hex(random_bytes(8)); }

function gen_code($dir) {
    $words = array('FOX','OAK','JET','SKY','OWL','ELM','BAY','ICE','SUN','RED',
                   'ZAP','KIWI','MOA','TUI','RATA','KEA','FERN','PINE');
    for ($i = 0; $i < 50; $i++) {
        $code = $words[random_int(0, count($words) - 1)] . '-' . random_int(10, 99);
        if (!file_exists(room_path($dir, $code))) return $code;
    }
    return 'G' . random_int(100000, 999999);
}

function gc_rooms($dir) {
    $files = @glob($dir . '/*.json');
    if (!$files) return;
    $now = time();
    foreach ($files as $f) {
        if ($now - @filemtime($f) > ROOM_TTL) @unlink($f);
    }
}

function write_room($dir, $code, $data) {
    file_put_contents(room_path($dir, $code), json_encode($data), LOCK_EX);
}

// Read-modify-write a room under an exclusive lock. $cb receives the decoded
// room (or null) and returns array($newRoomOrNull, $response). The room is only
// rewritten when $newRoom is non-null.
function with_room($dir, $code, $cb) {
    $p = room_path($dir, $code);
    if (!file_exists($p)) return null;
    $fh = fopen($p, 'r+');
    if (!$fh) return null;
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $data = json_decode($raw, true);
    $result = $cb(is_array($data) ? $data : null);
    if (is_array($result) && $result[0] !== null) {
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($result[0]));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return is_array($result) ? $result[1] : null;
}

// Roster without secret tokens, for sending to clients.
function public_roster($room) {
    $now = time();
    $out = array();
    foreach ($room['roster'] as $r) {
        $out[] = array(
            'slot'   => $r['slot'],
            'name'   => $r['name'],
            'online' => ($now - (isset($r['lastSeen']) ? $r['lastSeen'] : 0)) < 12,
        );
    }
    return $out;
}

function find_slot($room, $token) {
    if ($token === '') return -1;
    foreach ($room['roster'] as $r) {
        if (hash_equals((string)$r['token'], (string)$token)) return (int)$r['slot'];
    }
    return -1;
}

ensure_rooms($ROOMS);
if (random_int(1, 20) === 1) gc_rooms($ROOMS);

$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) $body = array();
$action = isset($_GET['action']) ? $_GET['action'] : (isset($body['action']) ? $body['action'] : '');

switch ($action) {

case 'health':
    ok(array('php' => PHP_VERSION, 'writable' => is_writable($ROOMS)));

case 'create': {
    $name = trim((string)(isset($body['name']) ? $body['name'] : ''));
    if ($name === '') $name = 'Player 1';
    $code  = gen_code($ROOMS);
    $token = gen_token();
    $now   = time();
    $room  = array(
        'code'       => $code,
        'status'     => 'lobby',
        'createdAt'  => $now,
        'updatedAt'  => $now,
        'seq'        => 1,
        'hostToken'  => $token,
        'config'     => isset($body['config']) ? $body['config'] : null,
        'roster'     => array(array('slot' => 0, 'name' => $name, 'token' => $token, 'lastSeen' => $now)),
        'state'      => null,
        'tileCounts' => null,
        'ended'      => false,
        'finalScores'=> null,
    );
    write_room($ROOMS, $code, $room);
    ok(array('code' => $code, 'token' => $token, 'slot' => 0, 'seq' => 1));
}

case 'join': {
    $code = sanitize_code(isset($body['code']) ? $body['code'] : '');
    if (!$code) fail('bad_code');
    $name = trim((string)(isset($body['name']) ? $body['name'] : ''));
    $resp = with_room($ROOMS, $code, function ($room) use ($name) {
        if (!$room) return array(null, array('ok' => false, 'error' => 'not_found'));
        if ($room['status'] !== 'lobby') return array(null, array('ok' => false, 'error' => 'started'));
        if (count($room['roster']) >= MAX_PLAYERS) return array(null, array('ok' => false, 'error' => 'full'));
        $slot  = count($room['roster']);
        $token = gen_token();
        $nm    = $name !== '' ? $name : ('Player ' . ($slot + 1));
        $room['roster'][] = array('slot' => $slot, 'name' => $nm, 'token' => $token, 'lastSeen' => time());
        $room['seq']++;
        $room['updatedAt'] = time();
        return array($room, array(
            'ok' => true, 'code' => $room['code'], 'token' => $token, 'slot' => $slot,
            'seq' => $room['seq'], 'config' => $room['config'], 'status' => $room['status'],
            'roster' => public_roster($room),
        ));
    });
    if ($resp === null) fail('not_found');
    out($resp);
}

case 'resume': {
    $code  = sanitize_code(isset($body['code']) ? $body['code'] : '');
    $token = (string)(isset($body['token']) ? $body['token'] : '');
    if (!$code) fail('bad_code');
    $resp = with_room($ROOMS, $code, function ($room) use ($token) {
        if (!$room) return array(null, array('ok' => false, 'error' => 'not_found'));
        $slot = find_slot($room, $token);
        if ($slot < 0) return array(null, array('ok' => false, 'error' => 'no_seat'));
        foreach ($room['roster'] as &$r) { if ((int)$r['slot'] === $slot) $r['lastSeen'] = time(); }
        unset($r);
        return array($room, array(
            'ok' => true, 'code' => $room['code'], 'slot' => $slot,
            'isHost' => hash_equals((string)$room['hostToken'], $token),
            'status' => $room['status'], 'config' => $room['config'], 'seq' => $room['seq'],
            'state' => $room['state'], 'tileCounts' => $room['tileCounts'],
            'ended' => $room['ended'], 'finalScores' => $room['finalScores'],
            'roster' => public_roster($room),
        ));
    });
    if ($resp === null) fail('not_found');
    out($resp);
}

case 'poll': {
    $code  = sanitize_code(isset($_GET['code']) ? $_GET['code'] : (isset($body['code']) ? $body['code'] : ''));
    if (!$code) fail('bad_code');
    $since = (int)(isset($_GET['since']) ? $_GET['since'] : (isset($body['since']) ? $body['since'] : 0));
    $token = (string)(isset($_GET['token']) ? $_GET['token'] : (isset($body['token']) ? $body['token'] : ''));
    $resp = with_room($ROOMS, $code, function ($room) use ($since, $token) {
        if (!$room) return array(null, array('ok' => false, 'error' => 'not_found'));
        $touched = false;
        if ($token !== '') {
            foreach ($room['roster'] as &$r) {
                if (hash_equals((string)$r['token'], $token)) { $r['lastSeen'] = time(); $touched = true; }
            }
            unset($r);
        }
        $payload = array('ok' => true, 'seq' => $room['seq'], 'status' => $room['status'],
                         'roster' => public_roster($room));
        if ($room['seq'] > $since) {
            $payload['state']       = $room['state'];
            $payload['tileCounts']  = $room['tileCounts'];
            $payload['ended']       = $room['ended'];
            $payload['finalScores'] = $room['finalScores'];
            $payload['config']      = $room['config'];
        } else {
            $payload['nochange'] = true;
        }
        return array($touched ? $room : null, $payload);
    });
    if ($resp === null) fail('not_found');
    out($resp);
}

case 'start': {
    $code  = sanitize_code(isset($body['code']) ? $body['code'] : '');
    $token = (string)(isset($body['token']) ? $body['token'] : '');
    if (!$code) fail('bad_code');
    $state  = isset($body['state']) ? $body['state'] : null;
    $counts = isset($body['tileCounts']) ? $body['tileCounts'] : null;
    $config = isset($body['config']) ? $body['config'] : null;
    if ($state !== null && strlen(json_encode($state)) > MAX_STATE) fail('too_big');
    $resp = with_room($ROOMS, $code, function ($room) use ($token, $state, $counts, $config) {
        if (!$room) return array(null, array('ok' => false, 'error' => 'not_found'));
        if (!hash_equals((string)$room['hostToken'], $token)) return array(null, array('ok' => false, 'error' => 'not_host'));
        $room['status']     = 'playing';
        $room['state']      = $state;
        $room['tileCounts'] = $counts;
        if ($config !== null) $room['config'] = $config;
        $room['seq']++;
        $room['updatedAt'] = time();
        return array($room, array('ok' => true, 'seq' => $room['seq']));
    });
    if ($resp === null) fail('not_found');
    out($resp);
}

case 'move': {
    $code  = sanitize_code(isset($body['code']) ? $body['code'] : '');
    $token = (string)(isset($body['token']) ? $body['token'] : '');
    if (!$code) fail('bad_code');
    $fromSlot = isset($body['fromSlot']) ? (int)$body['fromSlot'] : -1;
    $state    = isset($body['state']) ? $body['state'] : null;
    $counts   = isset($body['tileCounts']) ? $body['tileCounts'] : null;
    $ended    = !empty($body['ended']);
    $finals   = isset($body['finalScores']) ? $body['finalScores'] : null;
    if ($state !== null && strlen(json_encode($state)) > MAX_STATE) fail('too_big');
    $resp = with_room($ROOMS, $code, function ($room) use ($token, $fromSlot, $state, $counts, $ended, $finals) {
        if (!$room) return array(null, array('ok' => false, 'error' => 'not_found'));
        $slot = find_slot($room, $token);
        if ($slot < 0) return array(null, array('ok' => false, 'error' => 'no_seat'));
        if ($room['status'] !== 'playing') return array(null, array('ok' => false, 'error' => 'not_playing', 'seq' => $room['seq']));
        // Turn enforcement / optimistic concurrency: the mover must be the
        // player whose turn it currently is in the stored snapshot.
        $prev = $room['state'];
        $prevTurn = (is_array($prev) && isset($prev['currentPlayerIndex'])) ? (int)$prev['currentPlayerIndex'] : $fromSlot;
        if ($fromSlot !== $slot || $fromSlot !== $prevTurn) {
            return array(null, array('ok' => false, 'error' => 'not_your_turn', 'seq' => $room['seq']));
        }
        $room['state']      = $state;
        $room['tileCounts'] = $counts;
        if ($ended) { $room['ended'] = true; $room['finalScores'] = $finals; $room['status'] = 'finished'; }
        $room['seq']++;
        $room['updatedAt'] = time();
        return array($room, array('ok' => true, 'seq' => $room['seq']));
    });
    if ($resp === null) fail('not_found');
    out($resp);
}

case 'leave': {
    $code  = sanitize_code(isset($body['code']) ? $body['code'] : '');
    $token = (string)(isset($body['token']) ? $body['token'] : '');
    if (!$code) fail('bad_code');
    $resp = with_room($ROOMS, $code, function ($room) use ($token) {
        if (!$room) return array(null, array('ok' => true));
        // Only remove seats while still in the lobby; mid-game seats stay so the
        // snapshot's player indices remain valid.
        if ($room['status'] === 'lobby') {
            $room['roster'] = array_values(array_filter($room['roster'], function ($r) use ($token) {
                return !hash_equals((string)$r['token'], $token);
            }));
            foreach ($room['roster'] as $i => &$r) { $r['slot'] = $i; }
            unset($r);
            $room['seq']++;
            return array($room, array('ok' => true));
        }
        return array(null, array('ok' => true));
    });
    out($resp !== null ? $resp : array('ok' => true));
}

default:
    fail('unknown_action');
}
