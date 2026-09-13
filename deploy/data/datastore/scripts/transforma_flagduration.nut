function define(script)
{
    script.Name = "transforma_flagDuration";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionDelay command by setting the duration to the value in
// a specified zone flag
// - params[0]: Zone flag key, if not specified, the flag key matching the
//   delay ID will be checked and ignored if zero
function transform(source, cState, dState, zone, params)
{
    if(zone == null)
    {
        return -1;
    }

    if(params.len() >= 1)
    {
        action.SetDuration(zone.GetFlagState(params[0].tointeger(), 0, 0));
    }
    else if(action.GetDelayID())
    {
        local value = zone.GetFlagState(action.GetDelayID(), 0, 0);
        if(value > 0)
        {
            action.SetDuration(value);
        }
    }
    else
    {
        return -1;
    }

    return 0;
}