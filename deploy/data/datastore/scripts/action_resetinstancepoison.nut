function define(script)
{
    script.Name = "action_ResetInstancePoison";
    script.Type = "ActionCustom";
    return 0;
}

// Alter or set the PoisonLevel of the current instance
// - params[0]: value to alter/set the PoisonLevel by/to.
// - params[1]: if this exists, set the PoisonLevel to specific number.
function run(source, cState, dState, zone, server, params)
{
    local instance = zone.GetZoneInstance();
    if(instance == null || params.len() == 0)
    {
        return Result_t.FAIL;
    }

    if(params.len() == 1)
    {
        instance.PoisonLevel = instance.PoisonLevel + params[0].tointeger()
        return Result_t.SUCCESS
    }
    else if(params.len() == 2)
    {
        instance.PoisonLevel = params[0].tointeger()
        return Result_t.SUCCESS
    }

    return Result_t.FAIL;
}