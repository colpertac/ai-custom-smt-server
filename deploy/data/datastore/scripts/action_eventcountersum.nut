function define(script)
{
    script.Name = "action_eventCounterSum";
    script.Type = "ActionCustom";
    return 0;
}

// Sum the event counter values for a specified counter type and store the
// result into a zone flag
// - params[0]: Event counter type
// - params[1]: Zone flag key to store the value in
// - params[2]: Option flags, if 1 filter on current clan
// - params[3]: Optional max value to stop at
function run(source, cState, dState, zone, server, params)
{
    local worldDB = server.GetWorldDatabase();
    local character = cState.GetEntity();
    local clan = character != null ? character.GetClan().Get() : null;
    if(params.len() < 2 || zone == null)
    {
        return Result_t.FAIL;
    }

    local type = params[0].tointeger();
    local key = params[1].tointeger();
    local options = params.len() >= 3 ? params[2].tointeger() : 0;
    local max = params.len() >= 4 ? params[3].tointeger() : 0;

    local sum = 0;
    if(clan == null && (options & 1) != 0)
    {
        // No clan, stop here with 0 sum
        zone.SetFlagState(key, 0, 0);
        return Result_t.SUCCESS;
    }

    local counters = EventCounter.LoadEventCounterListByType(worldDB, type);
    foreach(counter in counters)
    {
        if(!counter.GetGroupCounter() && ((options & 1) == 0 ||
            counter.GetRelatedTo().ToString() == clan.GetUUID().ToString()))
        {
            sum = sum + counter.GetCounter();
            if(max && sum >= max)
            {
                sum = max;
                break;
            }
        }
    }

    zone.SetFlagState(key, sum, cState != null ? cState.GetWorldCID() : 0);

    return Result_t.SUCCESS;
}