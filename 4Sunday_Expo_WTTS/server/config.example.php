<?php
// COPY to config.php and set an ABSOLUTE directory OUTSIDE the public web root.
return [
    'private_dir' => '/home/www/ac-usti.cz/4sunday_private',
    // Exact origins for the optional WEB client. Native apps do not need CORS.
    'allowed_origins' => ['http://localhost:8081'],
    'session_ttl' => 7 * 24 * 3600,
];
