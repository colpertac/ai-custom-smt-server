function define(script)
{
    script.Name = "action_worldEventCounterBranch";
    script.Type = "ActionCustom";
    return 0;
}

// Create/Modify an event counter
// - params[0]: mode specifier with 1 being character flag mode and 2 being
//              zone event mode
// - params[1]: zone flag to use for mode 1, default tie event to use for mode 2
// - params[2]+: counter types to compare followed by events to fire (if mode 2)
function run(source, cState, dState, zone, server, params)
{
    local syncManager = server.GetChannelSyncManager();
    if(params.len() < 3)
    {
        return Result_t.FAIL;
    }

    local typeCount = 0;
    switch(params[0].tointeger())
    {
        case 1:
            if(cState == null || zone == null)
            {
                // Character must exist in a zone
                return Result_t.FAIL;
            }
            else if(params.len() % 2 == 1)
            {
                // Param count must be even
                return Result_t.FAIL;
            }

            typeCount = (params.len() - 2);
            break;
        case 2:
            // Types followed by events to use
            typeCount = (params.len() - 2) / 2;
            break;
        default:
            return Result_t.FAIL;
    }

    // Get the winning value and index
    local winnerIdx = -1;
    local winnerVal = 0;
    for(local i = 0; i < typeCount; i++)
    {
        local counter = syncManager.GetWorldEventCounter(params[i + 2].tointeger());
        if(counter)
        {
            if(winnerIdx == -1 || counter.GetCounter() > winnerVal)
            {
                winnerIdx = i + 2;
                winnerVal = counter.GetCounter();
            }
            else if(winnerIdx != -1 && counter.GetCounter() == winnerVal)
            {
                // There is a tie, reset winnerIdx to -1 and jump out
                winnerIdx = -1;
                break;
            }
        }
        else if(winnerIdx == -1)
        {
            // Counter not existing defaults to zero value
            winnerIdx = i + 2;
            winnerVal = 0;
        }
    }

    // Handle winner
    switch(params[0].tointeger())
    {
        case 1:
            // Set the result flag
            if(winnerIdx == -1)
            {
                // Set flag to zero to indicate tie
                zone.SetFlagState(params[1].tointeger(), 0, cState.GetWorldCID());
            }
            else
            {
                // Set flag to winning type
                zone.SetFlagState(params[winnerIdx].tointeger(), 0, cState.GetWorldCID());
            }
            break;
        case 2:
            // Start the winning event (with same zone context which can be null)
            if(winnerIdx == -1)
            {
                // Start default tie event
                server.GetZoneManager().StartZoneEvent(zone, params[1]);
            }
            else
            {
                // Start event matching param index
                server.GetZoneManager().StartZoneEvent(zone, params[winnerIdx + typeCount]);
            }
            break;
    }

    return Result_t.SUCCESS;
}