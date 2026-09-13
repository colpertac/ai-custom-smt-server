function define(script)
{
    script.Name = "transforma_flagRandom";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionUpdateZoneFlags command by setting all flag values for
// keys already defined on the action to random number either from a range or
// a supplied list.
// - params[0]: RANGE or LIST defining the mode
// - params[1]+: Minimum then maximum value for RANGE, list of random numbers
//   for LIST
function transform(source, cState, dState, zone, params)
{
    if(params.len() == 0)
    {
        return -1;
    }

    if(params[0] == "RANGE")
    {
        if(params.len() < 3)
        {
            return -1;
        }

        local min = params[1].tointeger();
        local max = params[2].tointeger();
        if(min > max)
        {
            return -1;
        }

        foreach(key in action.GetFlagStatesKeys())
        {
            action.SetFlagStatesEntry(key, Randomizer.RNG(min, max));
        }

        return 0;
    }
    else if(params[0] == "LIST")
    {
        if(params.len() < 2)
        {
            return -1;
        }

        foreach(key in action.GetFlagStatesKeys())
        {
            action.SetFlagStatesEntry(key, params[Randomizer.RNG(1, params.len() - 1)].tointeger());
        }

        return 0;
    }

    return -1;
}