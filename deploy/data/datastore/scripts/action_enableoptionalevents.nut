function define(script)
{
    script.Name = "action_enableOptionalEvents";
    script.Type = "ActionCustom";
    return 0;
}

// Enable the global optional events flag for the current zone
function run(source, cState, dState, zone, server, params)
{
    if(zone == null)
    {
        return Result_t.FAIL;
    }

    zone.SetFlagState(-1, 1, 0);

    return Result_t.SUCCESS;
}