function define(script)
{
    script.Name = "action_UBReset";
    script.Type = "ActionCustom";
    return 0;
}

// Reset the current Ultimate Battle tournment by saving off the current one
// and starting a new one
// - params[0]: Optional verification check for the current day of the month
function run(source, cState, dState, zone, server, params)
{
    local worldClock = server.GetWorldClockTime();
    if(params.len() >= 1)
    {
        local day = worldClock.Day;
        if(day != params[0].tointeger())
        {
            return Result_t.SUCCESS;
        }
    }

    local matchManager = server.GetMatchManager();
    local syncManager = server.GetChannelSyncManager();
    local worldDB = server.GetWorldDatabase();

    local previous = matchManager.GetUBTournament();

    local tournament = UBTournament();
    tournament.SetStartTime(worldClock.SystemTime);
    if(previous)
    {
        tournament.SetPrevious(previous.GetUUID());
        previous.SetEndTime(worldClock.SystemTime);
    }

    if(!PersistentObject.Register(tournament, UUID()) || !tournament.Insert(worldDB) ||
        (previous && !previous.Update(worldDB)))
    {
        return Result_t.FAIL;
    }

    syncManager.UpdateRecord(tournament, "UBTournament");
    if(previous)
    {
        syncManager.UpdateRecord(previous, "UBTournament");
    }

    syncManager.SyncOutgoing();

    return Result_t.SUCCESS;
}