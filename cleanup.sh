#!/bin/bash
cd /d/Code\ Projects/hockey-pools-api

# Delete unused controller files
rm -f src/controllers/draftPick.controller.js
rm -f src/controllers/franchise.controller.js
rm -f src/controllers/transaction.controller.js
rm -f src/controllers/auth.controller.js
rm -f src/controllers/team.controller.js

# Delete unused route files
rm -f src/routes/v1/team.route.js
rm -f src/routes/v1/transaction.route.js

# Delete unused config
rm -f src/config/passport.js

echo "Cleanup complete!"
