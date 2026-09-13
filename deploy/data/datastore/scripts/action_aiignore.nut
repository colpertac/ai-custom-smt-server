function define(script)
{
    script.Name = "action_aiIgnore";
    script.Type = "ActionCustom";
    return 0;
}

// Set the source entity as AI ignored
// - params[0]: Ignore time or 0 for infinite
function run(source, cState, dState, zone, server, params)
{
    if(source == null)
    {
        return Result_t.FAIL;
    }

    local time = params.len() >= 1 ? params[0].tointeger() : 0;
    if(time > 0)
    {
        source.SetStatusTimesEntry(0x80,
            server.GetServerTime() + (time * 1000000));
    }
    else
    {
        // Ignore until cancelled
        source.SetStatusTimesEntry(0x80, 0);
    }

    return Result_t.SUCCESS;
}