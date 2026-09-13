function define(script)
{
    script.Name = "action_worldCounter";
    script.Type = "ActionCustom";
    return 0;
}

// Reset an event world counter by expiring all active.
// - params[0]: event counter ID
function run(source, cState, dState, zone, server, params)
{
    local syncManager = server.GetChannelSyncManager();
    local worldDB = server.GetWorldDatabase();
    if(params.len() < 1)
    {
        return Result_t.FAIL;
    }

    local success = true;
    local counters = EventCounter.LoadEventCounterListByType(worldDB, params[0].tointeger())
    foreach(counter in counters)
    {
        if(!counter.GetCharacter() != null)
        {
            // Expire counter
            counter.SetPreExpireType(counter.GetType());
            counter.SetType(0);

            if(counter.Update(worldDB))
            {
                syncManager.UpdateRecord(counter, "EventCounter");
            }
            else
            {
                success = false;
            }
        }
    }

    //success = syncManager.SyncOutgoing() && success;
	syncManager.SyncOutgoing();
    return Result_t.SUCCESS;
}