mod config;
mod server;
mod ssh;

use anyhow::Result;
use clap::{Parser, Subcommand};

use crate::config::SshConfig;
use crate::ssh::SshClient;

#[derive(Debug, Parser)]
#[command(name = "sshdeck", version, about = "A fast SSH workspace for developers")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// List hosts discovered from ~/.ssh/config.
    List,
    /// Connect interactively to a host alias.
    Connect { host: String },
    /// Execute a command on a host alias.
    Exec {
        host: String,
        #[arg(trailing_var_arg = true, required = true)]
        command: Vec<String>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let config = SshConfig::load_default()?;
    let client = SshClient::default();

    match cli.command {
        Command::List => {
            let hosts = config.hosts();
            if hosts.is_empty() {
                println!("No SSH hosts found in ~/.ssh/config");
            } else {
                for host in hosts {
                    println!("{host}");
                }
            }
        }
        Command::Connect { host } => {
            config.require_host(&host)?;
            client.connect(&host)?;
        }
        Command::Exec { host, command } => {
            config.require_host(&host)?;
            let status = client.exec(&host, &command)?;
            std::process::exit(status);
        }
    }

    Ok(())
}
