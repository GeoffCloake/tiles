<?php
// Drop this file at geoffcloake.co.nz/tiles/php-test.php
// Load it in your browser. If you see the JSON below, PHP is available.
header('Content-Type: application/json');
echo json_encode([
    'php'     => phpversion(),
    'writable'=> is_writable(__DIR__),
    'result'  => 'PHP is working ✓'
]);
