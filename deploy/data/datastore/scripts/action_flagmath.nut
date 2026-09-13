function define(script)
{
    script.Name = "action_flagMath";
    script.Type = "ActionCustom";
    return 0;
}

// Perform one or more math operations on an input flag's value and set to an
// output flag. The value is stored as a decimal during the calculation and
// floored at the end.
// - params[0]: ZONE, INSTANCE, CHARACTER or INSTANCE_CHARACTER
// - params[1]: Key of the flag value to start with
// - params[2]: Key of the flag value to set at the end
// - params[3]+: Math operation list:
//   ADD: Adds next value
//   SUB: Subtracts next value
//   MULT: Multiplies next value
//   DIV: Divides next value
//   ADD_FLAG: Adds next key flag value
//   SUB_FLAG: Subtracts next key flag value
//   MULT_FLAG: Multiplies next key flag value
//   DIV_FLAG: Divides next key flag value
//   FLOOR: Rounds the current value down
//   CEIL: Rounds the current value up
//   MOD: Performs modulo on next value
//   MOD_FLAG: Performs modulo on next key flag value
//   BITAND: Performs Bitwise and operation on next value
//   BITAND_FLAG: Performs Bitwise and operation on next key flag value
function run(source, cState, dState, zone, server, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 5 || zone == null ||
        (params[0] != "ZONE" && params[0] != "INSTANCE" &&
        params[0] != "CHARACTER" && params[0] != "INSTANCE_CHARACTER"))
    {
        return Result_t.FAIL;
    }
    else if(params[0] == "CHARACTER" || params[0] == "INSTANCE_CHARACTER")
    {
        if(worldCID <= 0)
        {
            return Result_t.FAIL;
        }
    }
    else
    {
        worldCID = 0;
    }

    local inKey = params[1].tointeger();
    local outKey = params[2].tointeger();

    local flagSource = null;
    if(params[0] == "ZONE" || params[0] == "CHARACTER")
    {
        flagSource = zone;
    }
    else
    {
        flagSource = zone.GetZoneInstance();
    }

    if(flagSource == null)
    {
        return Result_t.FAIL;
    }

    local value = flagSource.GetFlagState(inKey, 0, worldCID).tofloat();
    for(local i = 3; i < params.len();)
    {
        if(params[i] == "FLOOR")
        {
            value = floor(value);
            i++;
        }
        else if(params[i] == "CEIL")
        {
            value = ceil(value);
            i++;
        }
        else if(i >= params.len() - 1)
        {
            break;
        }
        else
        {
            local otherVal = 0;
            if(params[i] == "ADD" || params[i] == "SUB" ||
                params[i] == "MULT" || params[i] == "DIV")
            {
                otherVal += params[i + 1].tofloat();
            }
            else if(params[i] == "ADD_FLAG" || params[i] == "SUB_FLAG" ||
                params[i] == "MULT_FLAG" || params[i] == "DIV_FLAG" || 
                params[i] == "MOD_FLAG" || params[i] == "BITAND_FLAG")
            {
                otherVal = flagSource.GetFlagState(params[i + 1].tointeger(), 0, worldCID).tofloat();
            }
            else
            {
                return Result_t.FAIL;
            }

            if(params[i] == "ADD" || params[i] == "ADD_FLAG")
            {
                value += otherVal;
            }
            else if(params[i] == "SUB" || params[i] == "SUB_FLAG")
            {
                value -= otherVal;
            }
            else if(params[i] == "MULT" || params[i] == "MULT_FLAG")
            {
                value *= otherVal;
            }
            else if(params[i] == "DIV" || params[i] == "DIV_FLAG")
            {
                value /= otherVal;
            }
            else if(params[i] == "MOD" || params[i] == "MOD_FLAG")
            {
                value %= otherVal;
            }
            else if(params[i] == "BITAND" || params[i] == "BITAND_FLAG")
            {
                value = value & otherVal;
            }
            i += 2;
        }
    }

    flagSource.SetFlagState(outKey, floor(value).tointeger(), worldCID);

    return Result_t.SUCCESS;
}